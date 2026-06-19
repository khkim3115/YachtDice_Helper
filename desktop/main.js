// Yacht Dice 트레이 미니 앱 (Electron)
// - 트레이 상주. 트레이 클릭 → 작은 네이티브 메뉴. '플레이'를 누르면 트레이 위에 아주 작은
//   검정 팝업이 떠서 그 안에서 최소 기능 싱글플레이 요트다이스를 한다(자립형 popup.html).
// - 바깥 클릭 시 팝업 숨김. 부팅 시 자동 실행(첫 실행 기본 ON). 완전 오프라인.
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, screen, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const POPUP = path.join(__dirname, 'popup.html');
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(__dirname, 'build', 'icon.png');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

// 아주 작은 팝업. 멀티 게임 중 상대 점수 패널(백틱)을 펼치면 옆으로만 넓어진다.
const SOLO_W = 270;
const SOLO_H = 358;
const MP_W = 270; // 멀티 기본 폭 — 싱글과 동일한 미니 느낌 유지
const MP_W_WIDE = 410; // 백틱으로 우측 상대 점수 패널을 펼쳤을 때
const MP_H = 380; // 로비/게임은 코드·플레이어 목록을 위해 살짝 더 높게

// 창 배경색 — 표시/리사이즈 순간의 깜빡임을 줄이려 테마에 맞춘다(light 값 = popup 의 라이트 --bg).
const BG = { dark: '#07090f', light: '#f4f4f5' };
const themeOf = (s) => (s.theme === 'light' ? 'light' : 'dark');

let tray = null;
let win = null;
let shownAt = 0; // 표시 직후 즉시 blur(깜빡임) 무시
let panelMode = 'solo'; // 'solo' | 'mp' — 트레이 메뉴가 결정, 렌더러에 전달
let sideOpen = false; // 멀티 게임에서 상대 점수 패널이 펼쳐져 있는지(폭 결정)
app.isQuitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showPanel());

  // 렌더러(✕/Esc)의 숨기기 요청 — 닫지 않고 hide만(상태 유지, blur 와 동일).
  ipcMain.on('yd-hide', () => {
    if (win && !win.isDestroyed()) win.hide();
  });

  // 멀티 게임에서 백틱으로 상대 점수 패널을 펼치거나 접을 때 — 창 폭만 조절(우하단 앵커 유지).
  ipcMain.on('yd-side', (_e, show) => {
    sideOpen = !!show;
    if (panelMode === 'mp' && win && !win.isDestroyed()) positionPanel();
  });

  // 렌더러의 ☀️/🌙 토글 — 테마를 settings.json 에 저장하고 창 배경색·트레이 메뉴를 갱신.
  ipcMain.on('yd-set-theme', (_e, mode) => {
    const theme = mode === 'light' ? 'light' : 'dark';
    const s = readSettings();
    s.theme = theme;
    writeSettings(s);
    if (win && !win.isDestroyed()) win.setBackgroundColor(BG[theme]);
    rebuildTrayMenu();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.khkim.yachtdice');
    setupAutostartDefault();
    createTray();
    createWindow(); // 미리 로드(빠른 첫 오픈), 메뉴에서 띄운다.
  });

  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    app.isQuitting = true;
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: SOLO_W,
    height: SOLO_H,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: BG[themeOf(readSettings())],
    icon: ICON_PATH,
    title: 'Yacht',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(POPUP);

  win.webContents.on('did-finish-load', () => {
    console.log('[yd] loaded:', win.webContents.getURL());
    win.webContents.send('yd-theme', themeOf(readSettings())); // 메인(settings.json)이 단일 출처 — 렌더러에 푸시
    if (process.env.YD_SMOKE) {
      const js = (s) => win.webContents.executeJavaScript(s).catch(() => 'err');
      (async () => {
        showPanel();
        await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space'}))");
        const before = await js('JSON.stringify({rolls:state.rolls,rolled:state.rolled})');
        // Esc → 숨기기(yd.hide). 창이 파괴되면 상태가 초기화될 것.
        await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
        await new Promise((r) => setTimeout(r, 350));
        const destroyed = win.isDestroyed();
        const visible = destroyed ? false : win.isVisible();
        if (!destroyed) showPanel();
        await new Promise((r) => setTimeout(r, 200));
        const after = destroyed ? 'DESTROYED' : await js('JSON.stringify({rolls:state.rolls,rolled:state.rolled})');
        console.log('[yd] persist-test before:', before, '| afterEscHide destroyed:', destroyed, 'wasHidden:', !visible, '| after:', after);
        app.isQuitting = true;
        app.quit();
      })();
    }
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[yd] load failed:', code, desc, url);
  });

  // 팝업 바깥 클릭(포커스 상실) → 숨김.
  win.on('blur', () => {
    if (win.webContents.isDevToolsOpened()) return;
    if (Date.now() - shownAt < 300) return;
    win.hide();
  });

  // 닫기(✕ / Alt+F4) = 트레이로 숨김.
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
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

// 현재 모드(+상대 패널 펼침 여부)에 따른 팝업 크기.
function panelDims() {
  if (panelMode !== 'mp') return { width: SOLO_W, height: SOLO_H };
  return { width: sideOpen ? MP_W_WIDE : MP_W, height: MP_H };
}

// 트레이 아이콘 위치 기준으로 팝업을 우하단(작업 영역 안)에 배치.
function positionPanel() {
  const tb = tray.getBounds();
  const area = screen.getDisplayMatching(tb).workArea;
  const dims = panelDims();
  const width = dims.width;
  const height = Math.min(dims.height, area.height - 16);
  let x = Math.round(tb.x + tb.width / 2 - width / 2);
  x = Math.min(x, area.x + area.width - width - 8);
  x = Math.max(x, area.x + 8);
  const y = area.y + area.height - height - 8;
  win.setBounds({ x, y, width, height });
}

function showPanel(mode = 'solo') {
  if (!win || win.isDestroyed()) {
    createWindow();
    win.once('ready-to-show', () => showPanel(mode));
    return;
  }
  panelMode = mode === 'mp' ? 'mp' : 'solo';
  if (panelMode !== 'mp') sideOpen = false; // 솔로로 돌아오면 패널 폭 초기화
  positionPanel();
  win.show();
  win.focus();
  shownAt = Date.now();
  win.webContents.send('yd-mode', panelMode); // 렌더러가 화면(solo/mp-lobby) 전환
}

// ── 트레이(좌/우클릭 모두 작은 네이티브 메뉴) ──
function createTray() {
  let img = nativeImage.createFromPath(ICON_PATH);
  if (!img.isEmpty()) img = img.resize({ width: 32, height: 32 });
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('Yacht Dice');
  tray.on('click', () => tray.popUpContextMenu());
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const autoOn = app.getLoginItemSettings().openAtLogin;
  const menu = Menu.buildFromTemplate([
    { label: 'Yacht Dice', enabled: false },
    { type: 'separator' },
    { label: '싱글플레이', click: () => showPanel('solo') },
    { label: '멀티플레이', click: () => showPanel('mp') },
    { type: 'separator' },
    {
      label: 'Windows 시작 시 자동 실행',
      type: 'checkbox',
      checked: autoOn,
      click: (item) => setAutostart(item.checked),
    },
    {
      label: '라이트 모드',
      type: 'checkbox',
      checked: themeOf(readSettings()) === 'light',
      click: (item) => {
        const theme = item.checked ? 'light' : 'dark';
        const s = readSettings();
        s.theme = theme;
        writeSettings(s);
        if (win && !win.isDestroyed()) {
          win.setBackgroundColor(BG[theme]);
          win.webContents.send('yd-theme', theme); // 숨겨져 있어도 다음 표시 때 이미 반영
        }
        rebuildTrayMenu(); // 체크 상태 갱신
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
    /* 무시 */
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
