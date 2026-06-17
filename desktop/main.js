// Yacht Dice 트레이 데스크톱 앱 (Electron 래퍼)
// - 빌드된 웹앱(../dist)을 커스텀 스킴(app://)으로 앱 내부에서 서빙 → 완전 오프라인.
// - 시스템 트레이 상주. 트레이 클릭 → 작은 네이티브 메뉴. '플레이'를 누르면 트레이 위에 뜨는
//   작은 팝업 패널 안에서 바로 게임을 플레이(별도 큰 창 X). 바깥 클릭 시 패널 숨김.
// - 부팅 시 자동 실행(첫 실행 기본 ON).
const { app, BrowserWindow, Tray, Menu, nativeImage, protocol, shell, screen } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// 웹 빌드 위치: 패키지 설치본은 resources/web, 개발 실행은 ../dist.
const DIST = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.join(__dirname, '..', 'dist');
const ICON_PATH = path.join(DIST, 'pwa-512x512.png');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

// 작은 트레이 팝업 패널(게임을 여기서 플레이). 높이는 표시 시 작업 영역에 맞춰 보정.
const PANEL_WIDTH = 440;
const PANEL_HEIGHT = 680;
const ZOOM = 0.8; // 작은 팝업에 맞게 게임 화면을 축소.

let tray = null;
let win = null;
let lastHide = 0; // 트레이 ↔ blur 중복 처리 방지
let shownAt = 0; // 표시 직후의 즉시 blur(깜빡임) 무시
app.isQuitting = false;

// ── 단일 인스턴스 ──
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showPanel());

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
    createWindow(); // 미리 만들어 두고(빠른 첫 오픈) 메뉴에서 띄운다.
  });

  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    app.isQuitting = true;
  });
}

// ── 커스텀 스킴 핸들러: app://… → DIST 의 파일을 읽어 응답 ──
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

// ── 작은 트레이 팝업 패널(게임 플레이 영역) ──
function createWindow() {
  win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false, // 테두리 없는 작은 팝업
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true, // 작업표시줄에 표시하지 않음
    alwaysOnTop: true,
    backgroundColor: '#0c1020',
    icon: ICON_PATH,
    title: 'Yacht Dice',
    webPreferences: { contextIsolation: true, nodeIntegration: false, zoomFactor: ZOOM },
  });
  Menu.setApplicationMenu(null);
  win.loadURL('app://bundle/index.html');

  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(ZOOM); // 작은 팝업에 맞게 축소(확실히 적용).
    console.log('[yd] loaded:', win.webContents.getURL());
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
        .finally(async () => {
          showPanel();
          await new Promise((res) => setTimeout(res, 900));
          try {
            const img = await win.webContents.capturePage();
            const out = path.join(app.getPath('temp'), 'yd-panel-shot.png');
            fs.writeFileSync(out, img.toPNG());
            console.log('[yd] shot:', out, JSON.stringify(img.getSize()));
          } catch (e) {
            console.error('[yd] shot err', e);
          }
          app.isQuitting = true;
          app.quit();
        });
    }
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[yd] load failed:', code, desc, url);
  });

  // 패널 바깥 클릭(포커스 상실) → 숨김.
  win.on('blur', () => {
    if (win.webContents.isDevToolsOpened()) return;
    if (Date.now() - shownAt < 300) return; // 표시 직후 즉시 blur 무시.
    hidePanel();
  });

  // 닫기(Alt+F4 등) = 트레이로 숨김(실제 종료는 메뉴 '종료'로만).
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      hidePanel();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// 트레이 아이콘 위치 기준으로 패널을 우하단(작업 영역 안)에 배치.
function positionPanel() {
  const trayBounds = tray.getBounds();
  const area = screen.getDisplayMatching(trayBounds).workArea;
  const width = PANEL_WIDTH;
  const height = Math.min(PANEL_HEIGHT, area.height - 16);
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2);
  x = Math.min(x, area.x + area.width - width - 8);
  x = Math.max(x, area.x + 8);
  const y = area.y + area.height - height - 8; // 작업표시줄 바로 위.
  win.setBounds({ x, y, width, height });
}

function showPanel() {
  if (!win || win.isDestroyed()) {
    createWindow();
    win.once('ready-to-show', () => showPanel());
    return;
  }
  positionPanel();
  win.show();
  win.focus();
  shownAt = Date.now();
}

function hidePanel() {
  if (win && !win.isDestroyed()) win.hide();
  lastHide = Date.now();
}

// ── 트레이(좌/우클릭 모두 작은 네이티브 메뉴) ──
function createTray() {
  let img = nativeImage.createFromPath(ICON_PATH);
  if (!img.isEmpty()) img = img.resize({ width: 32, height: 32 });
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('Yacht Dice — 요트다이스');
  tray.on('click', () => tray.popUpContextMenu());
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const autoOn = app.getLoginItemSettings().openAtLogin;
  const menu = Menu.buildFromTemplate([
    { label: 'Yacht Dice — 요트다이스', enabled: false },
    { type: 'separator' },
    { label: '플레이', click: () => showPanel() },
    { type: 'separator' },
    {
      label: 'Windows 시작 시 자동 실행',
      type: 'checkbox',
      checked: autoOn,
      click: (item) => setAutostart(item.checked),
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

function setupAutostartDefault() {
  if (process.env.YD_SMOKE) return;
  if (!app.isPackaged) return;
  const s = readSettings();
  if (!s.autostartConfigured) {
    app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
    s.autostartConfigured = true;
    s.autostart = true;
    writeSettings(s);
  }
}
