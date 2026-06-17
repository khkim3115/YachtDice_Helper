// Yacht Dice 트레이 데스크톱 앱 (Electron 래퍼)
// - 빌드된 웹앱(../dist)을 커스텀 스킴(app://)으로 앱 내부에서 서빙 → 완전 오프라인.
// - 시스템 트레이(우하단 알림 영역)에 상주. 트레이 클릭/메뉴로 열기·자동시작·종료.
// - 창을 닫아도 종료하지 않고 트레이로 숨김. 부팅 시 자동 실행(첫 실행 시 기본 ON).
const { app, BrowserWindow, Tray, Menu, nativeImage, protocol, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// 웹 빌드 위치: 패키지 설치본은 resources/web, 개발 실행은 ../dist.
const DIST = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.join(__dirname, '..', 'dist');
const ICON_PATH = path.join(DIST, 'pwa-512x512.png');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

let tray = null;
let win = null;
app.isQuitting = false;

// ── 단일 인스턴스(트레이에 이미 떠 있으면 새로 띄우지 않고 기존 창을 보여줌) ──
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  // 커스텀 스킴은 ready 이전에 등록해야 한다. allowServiceWorkers 는 켜지 않음
  // (앱 내부 서빙이라 SW 불필요 — 등록 시도는 조용히 실패하고 앱 동작에는 영향 없음).
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);

  app.whenReady().then(() => {
    app.setAppUserModelId('com.khkim.yachtdice');
    protocol.handle('app', handleAppProtocol);
    setupAutostartDefault();
    createTray();
    // 부팅 자동 실행(--hidden)으로 시작하면 창은 띄우지 않고 트레이에만 상주.
    const startHidden =
      process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin;
    createWindow(startHidden);
  });

  // 모든 창이 닫혀도 종료하지 않는다(트레이 상주).
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    app.isQuitting = true;
  });
}

// ── 커스텀 스킴 핸들러: app://… → ../dist 의 파일을 읽어 응답 ──
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.bin': 'application/octet-stream',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain',
};

async function handleAppProtocol(request) {
  try {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const filePath = path.normalize(path.join(DIST, pathname));
    // 경로 탈출 방지.
    if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    const data = await fsp.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new Response(data, {
      headers: { 'content-type': MIME[ext] || 'application/octet-stream' },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}

// ── 창 ──
function createWindow(hidden) {
  win = new BrowserWindow({
    width: 1120,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    show: false,
    backgroundColor: '#0c1020',
    icon: ICON_PATH,
    autoHideMenuBar: true,
    title: 'Yacht Dice',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.loadURL('app://bundle/index.html');

  win.webContents.on('did-finish-load', () => {
    console.log('[yd] loaded:', win.webContents.getURL());
    // 스모크 테스트: YD_SMOKE 설정 시 로드 확인 후 자동 종료(평상시엔 영향 없음).
    if (process.env.YD_SMOKE) {
      const probe = `(async () => {
        const rendered = !!document.querySelector('#root')?.children.length;
        let vbin = 'n/a';
        try {
          const r = await fetch('./V.bin');
          const b = await r.arrayBuffer();
          vbin = r.status + ' / ' + b.byteLength + ' bytes';
        } catch (e) { vbin = 'ERROR ' + e; }
        return { rendered, vbin };
      })()`;
      win.webContents
        .executeJavaScript(probe)
        .then((r) => console.log('[yd] probe:', JSON.stringify(r)))
        .catch((e) => console.error('[yd] probe error:', e))
        .finally(() => setTimeout(() => {
          app.isQuitting = true;
          app.quit();
        }, 1200));
    }
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[yd] load failed:', code, desc, url);
  });

  win.once('ready-to-show', () => {
    if (!hidden) win.show();
  });

  // 닫기 = 트레이로 숨김(실제 종료는 트레이 메뉴 '종료'로만).
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // 외부(http) 링크는 기본 브라우저로.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) {
    createWindow(false);
    win.once('ready-to-show', () => win.show());
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function toggleWindow() {
  if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) win.hide();
  else showWindow();
}

// ── 트레이 ──
function createTray() {
  let img = nativeImage.createFromPath(ICON_PATH);
  if (!img.isEmpty()) img = img.resize({ width: 32, height: 32 });
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('Yacht Dice — 요트다이스');
  tray.on('click', () => toggleWindow());
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const autoOn = app.getLoginItemSettings().openAtLogin;
  const menu = Menu.buildFromTemplate([
    { label: '🎲 플레이 / 열기', click: () => showWindow() },
    { type: 'separator' },
    {
      label: 'Windows 시작 시 자동 실행',
      type: 'checkbox',
      checked: autoOn,
      click: (item) => setAutostart(item.checked),
    },
    {
      label: '항상 위',
      type: 'checkbox',
      checked: win && !win.isDestroyed() ? win.isAlwaysOnTop() : false,
      click: (item) => {
        if (win && !win.isDestroyed()) win.setAlwaysOnTop(item.checked);
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

// ── 자동 시작(부팅 시 상주) ──
function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return {};
  }
}
function writeSettings(s) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s));
  } catch {
    /* 저장 실패는 무시 */
  }
}

function setAutostart(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
  const s = readSettings();
  s.autostartConfigured = true;
  s.autostart = enabled;
  writeSettings(s);
  rebuildTrayMenu();
}

// 첫 실행(설치본)에서만 기본값 ON. 사용자가 이후 메뉴로 끄면 그 선택을 존중.
function setupAutostartDefault() {
  if (process.env.YD_SMOKE) return; // 스모크 테스트는 시작 프로그램을 건드리지 않음.
  if (!app.isPackaged) return; // 개발 실행은 시작 프로그램을 건드리지 않음.
  const s = readSettings();
  if (!s.autostartConfigured) {
    app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
    s.autostartConfigured = true;
    s.autostart = true;
    writeSettings(s);
  }
}
