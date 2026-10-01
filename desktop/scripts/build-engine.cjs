// 웹 헬퍼 엔진(src/engine + src/core)을 트레이 렌더러(popup.html)용 단일 클래식 스크립트로 번들한다(#69).
// 출력: vendor/yd-engine.js — IIFE, 전역 `YDEngine` 하나만 노출(popup.html 의 공유 전역 스코프와 충돌 방지).
// gitignore 대상이며 npm start / npm run dist / npm run test:helper 가 매번 새로 만든다 → 웹 엔진과 항상 같은 소스.
// 가치 테이블(../public/V*.bin)은 electron-builder extraResources 로 동봉된다. 여기선 크기를 검증하고,
// 번들 + 테이블로 알려진 추천값을 재현하는 자체 점검을 한다(실패 시 빌드 중단 — '그럴듯하지만 틀린' 조언 방지).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..', '..'); // 저장소 루트
const OUT = path.join(__dirname, '..', 'vendor', 'yd-engine.js');
const fail = (msg) => { throw new Error('[build-engine] ' + msg); };

// 1) 가치 테이블 존재·크기 — electron-builder 는 누락된 extraResources 소스를 경고만 하므로 여기서 막는다.
const TABLES = { default: ['V.bin', 1048576], additional: ['V.additional.bin', 4194304] };
const V = {};
for (const [preset, [file, bytes]] of Object.entries(TABLES)) {
  const p = path.join(ROOT, 'public', file);
  if (!fs.existsSync(p)) fail(`가치 테이블 없음: ${p}`);
  const buf = fs.readFileSync(p);
  if (buf.length !== bytes) fail(`${file} 크기 불일치: ${buf.length} B (기대 ${bytes} B)`);
  V[preset] = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}

// 2) 번들 — 순수 계산 모듈만 re-export. loadValueTable 은 fetch 를 쓰므로 제외(테이블 로드는 popup.html 이 직접).
esbuild.buildSync({
  stdin: {
    contents: [
      "export { createAdvisor } from './engine/advisor';",
      "export { CATEGORY_IDS, DEFAULT_RULES, ADDITIONAL_RULES } from './core/rules';",
      "export { STATE_COUNT, STATE_COUNT_ADDITIONAL } from './core/stateIndex';",
    ].join('\n'),
    resolveDir: path.join(ROOT, 'src'),
    sourcefile: 'yd-engine-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  globalName: 'YDEngine',
  platform: 'browser',
  target: 'chrome130', // Electron 33 렌더러
  minify: true,
  legalComments: 'none',
  outfile: OUT,
  logLevel: 'warning',
});

// 3) 자체 점검 — 빈 V8 영역(vm)에서 번들을 실행해 웹 엔진(TS 원본)과 같은 추천값이 나오는지 확인.
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(OUT, 'utf8'), ctx, { filename: 'yd-engine.js' });
const E = ctx.YDEngine;
const near = (a, b) => Math.abs(a - b) < 0.01;
if (!E || typeof E.createAdvisor !== 'function') fail('번들에 YDEngine.createAdvisor 가 없음');
if (E.STATE_COUNT !== V.default.length) fail(`STATE_COUNT(${E.STATE_COUNT}) ≠ V.bin 길이(${V.default.length})`);
if (E.STATE_COUNT_ADDITIONAL !== V.additional.length) fail(`STATE_COUNT_ADDITIONAL(${E.STATE_COUNT_ADDITIONAL}) ≠ V.additional.bin 길이(${V.additional.length})`);
if (!near(V.default[0], 191.7609)) fail(`V.bin[0]=${V.default[0]} (기대 ≈191.7609 — 룰/테이블 불일치?)`);
if (!near(V.additional[1], 227.2057)) fail(`V.additional.bin[1]=${V.additional[1]} (기대 ≈227.2057)`);
const a1 = E.createAdvisor(V.default, E.DEFAULT_RULES).advise({ scores: {}, masterCells: [] }, [1, 2, 3, 4, 6], 2);
if (a1.holdMask.join() !== 'true,true,true,true,false' || a1.bestCategory !== 'smallStraight' || !near(a1.expectedFinalScore, 188.9306)) {
  fail('기본 룰 점검 실패: ' + JSON.stringify({ hold: a1.holdMask, best: a1.bestCategory, efs: a1.expectedFinalScore }));
}
// 추가 룰: 요트의 달인 칸(sixes)은 masterCells 에만 — 트레이 어댑터와 같은 카드 모양.
const a2 = E.createAdvisor(V.additional, E.ADDITIONAL_RULES).advise({ scores: { yacht: 50, fourKind: 24 }, masterCells: ['sixes'] }, [2, 3, 4, 5, 5], 1);
if (!near(a2.expectedFinalScore, 357.106)) fail('추가 룰 점검 실패: efs=' + a2.expectedFinalScore);

console.log(`[build-engine] vendor/yd-engine.js ${fs.statSync(OUT).size} B · 자체 점검 OK`);
