// Yacht Dice 트레이 데스크톱 앱 (Electron 래퍼)
// - 빌드된 웹앱(../dist)을 커스텀 스킴(app://)으로 앱 내부에서 서빙 → 완전 오프라인.
// - 시스템 트레이(우하단 알림 영역)에 상주. 게임은 트레이 위에 뜨는 팝업 패널에서 플레이.
// - 패널 바깥을 클릭하면 숨김, 작업표시줄에는 표시하지 않음. 부팅 시 자동 실행(첫 실행 기본 ON).
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

// 트레이 팝업 패널 크기(높이는 표시 시 작업 영역에 맞춰 보정).
const PANEL_WIDTH = 600;
const PANEL_HEIGHT = 880;

let tray = null;
let win = null;
let lastHide = 0; // 트레이 클릭 ↔ blur 중복 처리 방지용 타임스탬프
let shownAt = 0; // 표시 직후의 즉시 blur(런치 시 깜빡임) 무시용
app.isQuitting = false;

// ── 단일 인스턴스(트레이에 이미 떠 있으면 새로 띄우지 않고 기존 창을 보여줌) ──
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showPanel());

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
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false, // 테두리 없는 트레이 팝업 패널
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true, // 작업표시줄에 표시하지 않음(트레이 중심)
    alwaysOnTop: true,
    backgroundColor: '#0c1020',
    icon: ICON_PATH,
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
        .then((r) => console.log('[yd] probe:', JSON.stringify(r), 'bounds:', JSON.stringify(win.getBounds())))
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
    if (!hidden) showPanel();
  });

  // 패널 바깥을 클릭(포커스 잃음)하면 숨긴다.
  win.on('blur', () => {
    if (win.webContents.isDevToolsOpened()) return;
    // 표시 직후(런치 자동 표시 등)의 즉시 blur 는 무시 — 깜빡이며 닫히지 않게.
    if (Date.now() - shownAt < 300) return;
    hidePanel();
  });

  // 닫기(Alt+F4 등) = 트레이로 숨김(실제 종료는 트레이 메뉴 '종료'로만).
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      hidePanel();
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

// 트레이 아이콘 위치를 기준으로 패널을 우하단(작업 영역 안)에 배치.
function positionPanel() {
  const trayBounds = tray.getBounds();
  const area = screen.getDisplayMatching(trayBounds).workArea;
  const width = PANEL_WIDTH;
  const height = Math.min(PANEL_HEIGHT, area.height - 16);
  // x: 트레이 아이콘 중앙에 맞추되 작업 영역을 벗어나지 않게 보정.
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2);
  x = Math.min(x, area.x + area.width - width - 8);
  x = Math.max(x, area.x + 8);
  // y: 작업표시줄 바로 위.
  const y = area.y + area.height - height - 8;
  win.setBounds({ x, y, width, height });
}

function showPanel() {
  if (!win || win.isDestroyed()) {
    createWindow(false); // ready-to-show 에서 showPanel 이 다시 호출됨.
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

function togglePanel() {
  if (win && !win.isDestroyed() && win.isVisible()) {
    hidePanel();
    return;
  }
  // 패널이 떠 있을 때 트레이를 누르면 blur 가 먼저 숨긴다 — 직후의 클릭은 무시(재오픈 방지).
  if (Date.now() - lastHide < 250) return;
  showPanel();
}

// ── 트레이 ──
function createTray() {
  let img = nativeImage.createFromPath(ICON_PATH);
  if (!img.isEmpty()) img = img.resize({ width: 32, height: 32 });
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('Yacht Dice — 요트다이스');
  tray.on('click', () => togglePanel());
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const autoOn = app.getLoginItemSettings().openAtLogin;
  const menu = Menu.buildFromTemplate([
    { label: '🎲 플레이 / 열기', click: () => showPanel() },
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
