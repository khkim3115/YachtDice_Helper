// 트레이 헬퍼(#69) 렌더러 테스트 — 실제 popup.html 을 트레이와 같은 webPreferences·창 크기의 '숨은' 창에 띄우고
// 페이지 안에서 scripts/test-helper.page.js 의 단계(solo·governance·mp)를 실행한다. 화면엔 아무것도 뜨지 않는다.
// 실행: npm run test:helper (엔진 번들을 먼저 만든다). 결과: 콘솔 요약 + JSON(YD_TEST_OUT 또는 OS 임시폴더) + 종료코드.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const DESKTOP = path.join(__dirname, '..');
const OUT = process.env.YD_TEST_OUT || path.join(os.tmpdir(), 'yd-test-helper.json');
const SOLO = [270, 358]; // main.js SOLO_W/SOLO_H
const MP = [270, 380]; // main.js MP_W/MP_H
const PHASES = [['solo', SOLO], ['governance', SOLO], ['mp', MP]];

let done = false;
function finish(report) {
  if (done) return;
  done = true;
  try { fs.writeFileSync(OUT, JSON.stringify(report, null, 2)); } catch (_) { /* 무시 */ }
  const results = report.results || [];
  const failed = results.filter((r) => !r.ok);
  console.log(report.error ? `[test-helper] ERROR ${report.error}` : `[test-helper] ${results.length - failed.length}/${results.length} 통과 → ${OUT}`);
  for (const r of failed) console.log(`  ✗ [${r.phase}] ${r.name}${r.detail !== undefined ? ' — ' + r.detail : ''}`);
  app.exit(report.error || failed.length ? 1 : 0);
}
// 오류는 모달 대화상자 대신 결과 파일로(무인 실행 보장).
process.on('uncaughtException', (e) => finish({ error: String((e && e.stack) || e) }));
process.on('unhandledRejection', (e) => finish({ error: String((e && e.stack) || e) }));
setTimeout(() => finish({ error: 'timeout(60s)' }), 60000).unref();

// 실사용 설정·localStorage 와 격리된 임시 프로필.
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'yd-test-helper-')));

app.whenReady().then(async () => {
  if (!fs.existsSync(path.join(DESKTOP, 'vendor', 'yd-engine.js'))) throw new Error('vendor/yd-engine.js 없음 — npm run build:engine 먼저');
  const win = new BrowserWindow({
    width: SOLO[0], height: SOLO[1], show: false, frame: false, resizable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(DESKTOP, 'preload.js') },
  });
  await win.loadFile(path.join(DESKTOP, 'popup.html'));
  // 마지막 식이 함수라 결과 직렬화가 실패하지 않도록 끝에 true 를 붙인다.
  await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'test-helper.page.js'), 'utf8') + '\n;true');
  const results = [];
  for (const [phase, [w, h]] of PHASES) {
    if (!(await win.webContents.executeJavaScript(`typeof window.__ydTest.${phase} === 'function'`))) continue;
    win.setSize(w, h);
    await new Promise((r) => setTimeout(r, 150)); // 리사이즈 반영 대기
    const rs = await win.webContents.executeJavaScript(`window.__ydTest.${phase}()`);
    for (const r of rs) results.push({ phase, ...r });
  }
  finish({ results });
});
