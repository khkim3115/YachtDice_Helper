// Yacht Dice 트레이 미니 앱 (Electron)
// - 트레이 상주. 트레이 클릭 → 작은 네이티브 메뉴. '플레이'를 누르면 트레이 위에 아주 작은
//   검정 팝업이 떠서 그 안에서 최소 기능 싱글플레이 요트다이스를 한다(자립형 popup.html).
// - 바깥 클릭 시 팝업 숨김. 부팅 시 자동 실행(첫 실행 기본 ON). 완전 오프라인.
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, screen, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
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

// 창 투명도(불투명도) — 30~100 정수(%). 30% 바닥값은 창이 완전히 사라져 잃어버리는 것을 방지.
// 슬라이더·setOpacity·저장값이 모두 이 클램프를 단일 출처로 공유한다.
const OPACITY_MIN = 30;
const opacityOf = (s) => {
  const v = Number.isFinite(s.opacity) ? Math.round(s.opacity) : 100;
  return Math.max(OPACITY_MIN, Math.min(100, v));
};

let tray = null;
let win = null;
let shownAt = 0; // 표시 직후 즉시 blur(깜빡임) 무시
let panelMode = 'solo'; // 'solo' | 'mp' — 트레이 메뉴가 결정, 렌더러에 전달
let sideOpen = false; // 멀티 게임에서 상대 점수 패널이 펼쳐져 있는지(폭 결정)
// 자동 업데이트 상태 — 메모리 전용(settings.json 영속화 안 함). 트레이 메뉴 라벨이 이 값을 읽는다.
// 진행 표시(휘발성)와 "설치 가능"(영속 사실)을 분리한다 — 주기 재확인의 진행 이벤트가
// 이미 받아둔 설치본 표시를 덮어써 사라지게 하는 회귀를 막기 위함.
let updateState = 'idle'; // 'idle' | 'checking' | 'downloading' — 다운로드 완료 전의 진행 표시
let updateReady = false; // 다운로드 완료 → 설치 가능(진행 이벤트가 이 사실을 덮지 못함)
let pendingUpdateVersion = null; // 설치 가능한 신버전(설치 항목 라벨용)
let updateCheckTimer = null; // 1시간 재확인 인터벌 핸들(다운로드 완료 시 정리)
let autoUpdaterActive = false; // setupAutoUpdater 가 실제 활성화됐는지(개발 모드 no-op 검증 지점)
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

  // 렌더러 투명도 슬라이더 — 30~100으로 클램프해 즉시 적용. 드래그 중(persist=false)엔 적용만,
  // 드래그 끝(persist=true)에만 settings.json 저장(디스크 난타 방지).
  ipcMain.on('yd-set-opacity', (_e, payload) => {
    const value = opacityOf({ opacity: payload && payload.value });
    if (win && !win.isDestroyed()) win.setOpacity(value / 100);
    if (payload && payload.persist) {
      const s = readSettings();
      s.opacity = value;
      writeSettings(s);
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.khkim.yachtdice');
    setupAutostartDefault();
    createTray();
    createWindow(); // 미리 로드(빠른 첫 오픈), 메뉴에서 띄운다.
    setupAutoUpdater(); // 설치본에서만 동작(개발 모드는 no-op)
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
  win.setOpacity(opacityOf(readSettings()) / 100); // 저장된 투명도 복원
  win.loadFile(POPUP);

  win.webContents.on('did-finish-load', () => {
    console.log('[yd] loaded:', win.webContents.getURL());
    win.webContents.send('yd-theme', themeOf(readSettings())); // 메인(settings.json)이 단일 출처 — 렌더러에 푸시
    win.webContents.send('yd-opacity', opacityOf(readSettings())); // 슬라이더 초기값 복원
    if (process.env.YD_SMOKE) {
      const js = (s) => win.webContents.executeJavaScript(s).catch(() => 'err');
      (async () => {
        showPanel();
        // 투명도 IPC 검증 — 핸들러를 직접 호출(emit)해 win.getOpacity()·저장값·바닥값 클램프 확인.
        const origOpacity = opacityOf(readSettings()); // 검증 후 원복용(영속 설정 보존)
        ipcMain.emit('yd-set-opacity', {}, { value: 45, persist: true });
        const op45 = Math.round(win.getOpacity() * 100);
        const saved45 = readSettings().opacity;
        ipcMain.emit('yd-set-opacity', {}, { value: 5, persist: false }); // 5 → 30 클램프
        const opClamp = Math.round(win.getOpacity() * 100);
        ipcMain.emit('yd-set-opacity', {}, { value: origOpacity, persist: true }); // 원래 값으로 복원
        const opResult = { op45, saved45, opClamp, restored: Math.round(win.getOpacity() * 100) };
        console.log('[yd] opacity-test', JSON.stringify(opResult));
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

// 트레이 메뉴 템플릿(평면 배열). Electron 의존 값(자동실행·테마·업데이트 상태)을 인자로 받아 메뉴 구성과
// 분리한다 — 상태를 주입해 항목 집합을 따로 점검할 수 있다. update 에 따라 업데이트 항목 집합이 달라진다.
function buildTrayTemplate({ autoOn, isLight, update }) {
  const items = [
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
      checked: isLight,
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
  ];
  // 자동 업데이트 항목은 설치본에서만(update.enabled) 노출 — 개발 모드에선 동작하지 않으므로 통째로 숨긴다.
  if (update.enabled) {
    // 다운로드가 끝나 설치 가능하면(ready) "설치" 항목(클릭 → 재시작·설치). 발견·다운로드만으론 절대 재시작 안 함.
    // ready 는 영속 사실이라 주기 재확인의 진행/오류 이벤트가 이 항목을 가리거나 지우지 못한다.
    if (update.ready) {
      items.push({
        label: `📥 업데이트 ${update.version ? 'v' + update.version + ' ' : ''}설치`,
        // 설치가 시작되면 electron-updater 가 app.quit() → 'before-quit' 가 isQuitting 을 세팅해 창이 정상 종료된다.
        // 동기 사전실패(설치 파일 없음 등)면 quit 이 안 일어나니, isQuitting 을 미리 만지지 않아야 ✕=숨김이 유지된다.
        click: () => autoUpdater.quitAndInstall(),
      });
    }
    // "지금 업데이트 확인" — 아직 받지 않았을 때만 활성. 이미 받았으면(ready) 비활성. 진행 상태는 라벨로 피드백.
    items.push({
      label:
        update.state === 'checking'
          ? '🔄 업데이트 확인 중…'
          : update.state === 'downloading'
            ? '⬇️ 업데이트 다운로드 중…'
            : '🔄 지금 업데이트 확인',
      enabled: !update.ready && update.state === 'idle',
      click: () => checkForUpdates(),
    });
    items.push({ type: 'separator' });
  }
  items.push({
    label: '종료',
    click: () => {
      app.isQuitting = true;
      app.quit();
    },
  });
  return items;
}

function rebuildTrayMenu() {
  if (!tray) return;
  const template = buildTrayTemplate({
    autoOn: app.getLoginItemSettings().openAtLogin,
    isLight: themeOf(readSettings()) === 'light',
    // 설치본에서만 업데이트 항목 노출. app.isPackaged 는 실행 내내 불변이라 init 순서와 무관(=autoUpdaterActive 보다 안전).
    update: { enabled: app.isPackaged, state: updateState, ready: updateReady, version: pendingUpdateVersion },
  });
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

// ── 자동 업데이트(electron-updater + GitHub Release) ──
// 백그라운드로 자동 다운로드한 뒤, 트레이 메뉴의 "설치"를 사용자가 누를 때만 재시작·설치한다.
// (멀티 게임 중 자동 재시작으로 방 상태가 유실되는 것을 막기 위해 autoInstallOnAppQuit=false.)
function setupAutoUpdater() {
  if (!app.isPackaged) return; // app.isPackaged 가 false 면 비활성(개발·스모크 포함) — 설치본에서만 동작
  autoUpdaterActive = true;
  autoUpdater.autoDownload = true; // 발견 즉시 백그라운드 다운로드
  autoUpdater.autoInstallOnAppQuit = false; // 설치는 사용자가 "설치"를 누를 때만
  // ⚠️ allowPrerelease 는 반드시 false 로 유지할 것. true 면 GitHubProvider 가 릴리스 태그를
  //    semver.valid() 로 거르는데, 이 저장소 태그(tray-vX.Y.Z)는 invalid 로 판정돼 전부 건너뛴다.
  //    false 경로는 /releases/latest 의 tag_name 을 그대로 쓰고 버전은 latest.yml 에서 읽는다.
  autoUpdater.allowPrerelease = false;

  // 진행 표시 이벤트(checking/available/not-available/error)는 아직 받지 않았을 때만 의미가 있다.
  // 이미 ready 면 무시 — 그래야 (받아둔 뒤의) 재확인 이벤트가 설치 항목을 가리거나 지우지 않는다.
  autoUpdater.on('checking-for-update', () => {
    if (updateReady) return;
    updateState = 'checking';
    rebuildTrayMenu();
  });
  autoUpdater.on('update-available', () => {
    if (updateReady) return;
    updateState = 'downloading'; // autoDownload 가 곧바로 받기 시작
    rebuildTrayMenu();
  });
  autoUpdater.on('update-not-available', () => {
    if (updateReady) return;
    updateState = 'idle';
    rebuildTrayMenu();
  });
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true; // 영속 — 이후 어떤 진행/오류 이벤트도 이 사실을 못 지운다
    pendingUpdateVersion = info && info.version ? info.version : null;
    updateState = 'idle'; // 진행 표시 종료
    if (updateCheckTimer) {
      clearInterval(updateCheckTimer); // 받아뒀으니 더는 재확인하지 않는다(상태 churn 방지)
      updateCheckTimer = null;
    }
    rebuildTrayMenu(); // → "📥 업데이트 설치" 항목 등장
  });
  autoUpdater.on('error', () => {
    // 오프라인·레이트리밋 등은 조용히 무시(받아둔 설치본은 보존 — ready 면 손대지 않음).
    if (updateReady) return;
    updateState = 'idle';
    rebuildTrayMenu();
  });

  checkForUpdates(); // 시작 시 1회
  updateCheckTimer = setInterval(checkForUpdates, 60 * 60 * 1000); // 이후 1시간 간격(받으면 위에서 정리)
}

// 자동(시작/주기)·수동(메뉴) 공통 진입점. 거부는 삼켜 unhandled rejection 을 막는다(error 이벤트로 처리).
// 이미 받아뒀으면(ready) 같은 버전을 또 받을 이유가 없으니 재확인하지 않는다.
function checkForUpdates() {
  if (!autoUpdaterActive || updateReady) return;
  autoUpdater.checkForUpdates().catch(() => {});
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
