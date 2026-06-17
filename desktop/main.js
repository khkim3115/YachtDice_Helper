// Yacht Dice 트레이 미니 앱 (Electron)
// - 트레이 상주. 트레이 클릭 → 작은 네이티브 메뉴. '플레이'를 누르면 트레이 위에 아주 작은
//   검정 팝업이 떠서 그 안에서 최소 기능 싱글플레이 요트다이스를 한다(자립형 popup.html).
// - 바깥 클릭 시 팝업 숨김. 부팅 시 자동 실행(첫 실행 기본 ON). 완전 오프라인.
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const POPUP = path.join(__dirname, 'popup.html');
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(__dirname, 'build', 'icon.png');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

// 아주 작은 팝업.
const PANEL_WIDTH = 270;
const PANEL_HEIGHT = 358;

let tray = null;
let win = null;
let shownAt = 0; // 표시 직후 즉시 blur(깜빡임) 무시
app.isQuitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showPanel());

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
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#07090f',
    icon: ICON_PATH,
    title: 'Yacht',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(POPUP);

  win.webContents.on('did-finish-load', () => {
    console.log('[yd] loaded:', win.webContents.getURL());
    if (process.env.YD_SMOKE) {
      showPanel();
      win.webContents
        .executeJavaScript(
          "document.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space'}));" +
            "document.dispatchEvent(new KeyboardEvent('keydown',{key:'1'}));" +
            "document.dispatchEvent(new KeyboardEvent('keydown',{key:'3'}));"
        )
        .catch(() => {});
      setTimeout(async () => {
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
      }, 800);
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

// 트레이 아이콘 위치 기준으로 팝업을 우하단(작업 영역 안)에 배치.
function positionPanel() {
  const tb = tray.getBounds();
  const area = screen.getDisplayMatching(tb).workArea;
  const width = PANEL_WIDTH;
  const height = Math.min(PANEL_HEIGHT, area.height - 16);
  let x = Math.round(tb.x + tb.width / 2 - width / 2);
  x = Math.min(x, area.x + area.width - width - 8);
  x = Math.max(x, area.x + 8);
  const y = area.y + area.height - height - 8;
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
