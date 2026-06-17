// 렌더러에서 창을 '닫지' 않고 '숨기기'만 요청하도록 안전한 API 노출.
// (window.close() 는 창을 파괴해 다시 열 때 상태가 초기화되므로 사용하지 않는다.)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yd', {
  hide: () => ipcRenderer.send('yd-hide'),
});
