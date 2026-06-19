// 렌더러에서 창을 '닫지' 않고 '숨기기'만 요청하도록 안전한 API 노출.
// (window.close() 는 창을 파괴해 다시 열 때 상태가 초기화되므로 사용하지 않는다.)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yd', {
  hide: () => ipcRenderer.send('yd-hide'),
  // 트레이 메뉴(싱글/멀티)가 보낸 모드를 렌더러가 구독 — 'solo' | 'mp'.
  onMode: (cb) => ipcRenderer.on('yd-mode', (_e, mode) => cb(mode)),
  // 멀티 게임에서 백틱으로 상대 점수 패널을 펼치면 창 폭을 넓혀달라고 요청.
  setSide: (show) => ipcRenderer.send('yd-side', !!show),
  // 테마: 메인이 보낸 초기/변경 테마를 렌더러가 구독.
  onTheme: (cb) => ipcRenderer.on('yd-theme', (_e, mode) => cb(mode)),
  // 렌더러의 ☀️/🌙 토글을 메인에 전달(settings.json 영속화).
  setTheme: (mode) => ipcRenderer.send('yd-set-theme', mode === 'light' ? 'light' : 'dark'),
});
