# 데스크톱 트레이 앱 최적-EV 헬퍼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Electron 트레이 앱(`desktop/`)에 웹과 같은 최적-EV 헬퍼(솔로 + 멀티 '헬퍼 허용' 방)를 웹과 같은 공정성 규칙으로 탑재한다.

**Architecture:** 웹 엔진(`src/engine` + `src/core`)을 빌드 타임에 esbuild 로 단일 IIFE(`vendor/yd-engine.js`, 전역 `YDEngine`)로 번들하고, 가치 테이블(`public/V*.bin`)은 electron-builder `extraResources` 로 동봉한다. `popup.html` 은 `fetch('../public/V*.bin')`(dev·패키지 동일 URL)로 테이블을 지연 로드해 `render()`/`renderMpGame()` 끝 훅에서 메모된 조언을 그린다. 실격 플래그 `helperUsed` 는 `undoUsed` 처럼 `state` 밖에 둔다.

**Tech Stack:** Electron 33, electron-builder 25, esbuild 0.28.2(desktop devDependency), 순수 인라인 JS(`desktop/popup.html`), Node `vm`(번들 자체 점검).

**Spec:** `docs/superpowers/specs/2026-10-01-desktop-helper-design.md` (이슈 #69)

**Status:** ✅ 완료 — 전 태스크 구현·리뷰 후 PR #70(`1d32932`)으로 머지, tray-v0.10.0 · web-v0.8.2 로 출시(PR #79, 2026-10-02). 후속: #71·#72(마일스톤 #10).

## Global Constraints

- 엔진은 **웹 소스를 번들**한다 — DP·카테고리 순서·테이블 인덱싱을 popup.html 에 손으로 옮기지 않는다. 트레이 채점 코드는 기존 사본 유지.
- 번들 엔트리는 `createAdvisor`, `CATEGORY_IDS`, `DEFAULT_RULES`, `ADDITIONAL_RULES`, `STATE_COUNT`, `STATE_COUNT_ADDITIONAL` 만 re-export(`loadValueTable` 제외 → 번들에 호스트 API 없음). IIFE, `globalName: 'YDEngine'`, `target: 'chrome130'`, minify.
- 테이블: `V.bin` = 1,048,576 B(262,144 float32, `V[0]≈191.7609`), `V.additional.bin` = 4,194,304 B(1,048,576 float32, `VA[1]≈227.2057`). 짝: default↔`DEFAULT_RULES`, additional↔`ADDITIONAL_RULES` — 절대 교차 금지.
- 테이블은 `extraResources` `{from:'../public', to:'public', filter:['V.bin','V.additional.bin']}` 로만 동봉(asar 안 금지 — 이후 업데이트마다 +1~1.77 MB). 렌더러 URL 은 `../public/V.bin`·`../public/V.additional.bin`.
- `vendor/yd-engine.js` 는 gitignore. `prestart`·`predist`·`test:helper` 가 매번 생성. esbuild 는 **정확히 `0.28.2`**(desktop devDependency, lockfile 커밋).
- 어댑터: `ENGINE_IDS` = `['ones','twos','threes','fours','fives','sixes','choice','fourKind','fullHouse','smallStraight','largeStraight','yacht']`(CATS 인덱스 정렬, script 1 에 정의 — `TO_SERVER` 사용 금지). 달인 칸은 `masterCells` 에만.
- `helperUsed` 는 script 1 최상위 `let`, `undoUsed` 옆, `state`·`history` 밖. **조언이 렌더될 때** `true`, `reset()` 에서만 `false`. 멀티는 건드리지 않음.
- 헬퍼 ON/OFF: localStorage `yd_helper`(`'1'`/`'0'`), 기본 OFF. 단축키 H = `e.code==='KeyH'`, Ctrl/Alt/Meta 무시, 그 키가 칸/주사위 단축키 문자를 내면 무시(기존 단축키 우선).
- UI 는 무채색 CSS 변수만(`--emph`/`--mut`/`--line` …), 창 크기·main.js 창 로직 불변. 한 줄 요약 + `.die.rec` 밑줄 + `.cat.rec` 테두리.
- 문구(정확히): `요트의 달인! {칸} 칸에 기록 · +100` / `지금 {칸}에 기록 · {n}점` / `{눈, 눈} 보관하고 다시 굴리기 · +{x.x}` / `모두 다시 굴리기 · +{x.x}` / 우측 `예상 {N}` / `헬퍼 데이터 로딩 중…` / `헬퍼 데이터를 불러오지 못했습니다` / `주사위를 굴리면 최적의 수를 추천해 드려요.` / `추천을 계산하지 못했습니다` / `헬퍼 허용 방 · H 로 켜기` / `헬퍼 사용 — 리더보드 등록 제외` / `헬퍼·되돌리기 사용 — 리더보드 등록 제외` / `헬퍼 허용 방 — 리더보드 등록 제외` / `평균 미반영(헬퍼|헬퍼·되돌리기|되돌리기)` / `{기본 룰|추가 룰} · 헬퍼 {허용|비허용}` / 칩 `헬퍼 비허용`·`헬퍼 허용`·`헬퍼 비허용 (추가 룰)`.
- 서버(Supabase) 스키마·RPC 변경 없음. 코드 주석은 한국어.
- 검증 중 **화면에 창·모달을 띄우지 않는다** — 렌더러 검증은 `npm run test:helper`(숨은 창). 실제 main.js YD_SMOKE 는 기존 하니스 특성상 팝업이 잠깐 뜨므로 Task 5 에서만 1회.

## Review Focus

테스트가 직접 다루지 않던, 사용자가 실제로 마주칠 가능성이 높은 입력·조건 — 각 줄의 테스트를 담당 태스크에 추가했다.

1. **한글 IME 조합 중 H**(`key:'Process'`, `isComposing:true`, 또는 `'ㅗ'`) — 솔로 보드엔 입력란이 없으므로 토글돼야 한다. → Task 2 Step 1 `IME` 검사.
2. **멀티 Realtime 이벤트마다 객체 재생성** — 값이 같으면 재계산·깜빡임 없이 같은 조언(메모 유지). → Task 4 Step 1 `메모 유지` 검사.
3. **비정상 엔진 입력**(주사위 0·빈 배열·`rerollsLeft` 3) — 조언 `null`, 예외 없음, 보드 정상. → Task 2 Step 1 `비정상 입력` 검사.
4. **테이블 누락/경로 오류** — 오류 문구 + 게임은 계속(12칸 기록 가능). → Task 2 Step 1 `로드 실패` 검사.
5. **설치본 경로(resources/public)** — dev 와 같은 상대 URL 로 로드돼야 한다. → Task 5 Step 4 패키지 exe YD_SMOKE.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `desktop/scripts/build-engine.cjs` | 엔진 번들 + 테이블 크기 검증 + 번들 자체 점검 | 신규 (Task 1) |
| `desktop/package.json` / `desktop/package-lock.json` | 의존성·스크립트·패키지 구성 | 수정 (Task 1, 2) |
| `desktop/.gitignore` | 생성물 제외 | 수정 (Task 1) |
| `.github/workflows/desktop-release.yml` | 릴리스 빌드 | 패키지 assert 추가 (Task 1) |
| `desktop/main.js` | Electron 메인 | `setupAutoUpdater` YD_SMOKE 스킵 (Task 1), YD_SMOKE `helper` 프로브 (Task 5) |
| `desktop/scripts/test-helper.cjs` | 숨은 창 렌더러 테스트 러너 | 신규 (Task 2) |
| `desktop/scripts/test-helper.page.js` | 페이지 내부 테스트 단계(solo·governance·mp) | 신규 (Task 2), 단계 추가 (Task 3, 4) |
| `desktop/popup.html` | 트레이 UI + 게임 로직 | 헬퍼 모듈·UI (Task 2), 솔로 게이트 (Task 3), 멀티 (Task 4) |
| `desktop/README.md`, `CLAUDE.md` | 문서 | (Task 5) |

## Verification Harness (모든 태스크 공통)

```bash
cd desktop
npm run build:engine     # 테이블 크기 + 번들 자체 점검. 출력: "[build-engine] vendor/yd-engine.js NNNN B · 자체 점검 OK"
npm run test:helper      # (Task 2+) 숨은 창 렌더러 테스트. 출력: "[test-helper] N/N 통과 → <tmp>/yd-test-helper.json", 실패 시 종료코드 1 + ✗ 목록
```

- `test:helper` 는 `scripts/test-helper.cjs` 를 Electron 메인으로 실행한다: 트레이와 **같은 webPreferences·preload·창 크기(솔로 270×358, 멀티 270×380)** 의 `show:false` 창에 실제 `popup.html` 을 띄우고 `test-helper.page.js` 를 주입해 단계별 검사. 임시 userData(실사용 설정 무영향), 오류는 모달 대신 결과 파일, 60초 타임아웃.
- 페이지 코드는 popup.html 의 전역(`state`·`render`·`helper*`·`mp*`)을 직접 다룬다(classic script 공유 전역 — 기존 static-preview 검증과 같은 원리). 네트워크는 쓰지 않는다(`fetch`/`rpc`/`ensureAnon`/`enterRoom` 스텁).
- 실제 main.js 검증(Task 5): 기존 YD_SMOKE 하니스 — 팝업이 수 초간 화면에 떴다 사라진다(기존 특성).

---

## Task 1: 엔진 번들 + 패키징

**Files:**
- Create: `desktop/scripts/build-engine.cjs`
- Modify: `desktop/package.json`, `desktop/package-lock.json`, `desktop/.gitignore`, `.github/workflows/desktop-release.yml`, `desktop/main.js`(`setupAutoUpdater`)

**Interfaces:**
- Produces: `desktop/vendor/yd-engine.js` — `window.YDEngine = { createAdvisor(V: Float32Array, rules): { advise(card: {scores: Record<id,number>, masterCells: id[]}, dice: number[5], rerollsLeft: 0|1|2): Advice }, CATEGORY_IDS: string[12], DEFAULT_RULES, ADDITIONAL_RULES, STATE_COUNT: 262144, STATE_COUNT_ADDITIONAL: 1048576 }`. 패키지: `resources/public/V.bin`·`V.additional.bin`, `app.asar/vendor/yd-engine.js`.

- [ ] **Step 1: 실패 확인** — 아직 스크립트가 없다.

Run: `cd desktop && node scripts/build-engine.cjs`
Expected: FAIL `Cannot find module '.../scripts/build-engine.cjs'`

- [ ] **Step 2: esbuild 고정 설치(lockfile 갱신)**

Run: `cd desktop && npm install -D -E esbuild@0.28.2`
Expected: `package.json` devDependencies 에 `"esbuild": "0.28.2"`, `package-lock.json` 에 `@esbuild/win32-x64`·`@esbuild/darwin-arm64` 등 optional 항목 추가.

- [ ] **Step 3: `desktop/scripts/build-engine.cjs` 작성**

```js
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
```

- [ ] **Step 4: `desktop/package.json` — scripts·files·extraResources·description**

`"description"` →
```json
  "description": "Yacht Dice 트레이 데스크톱 앱 — 자립형 popup.html(솔로·멀티·리더보드)을 시스템 트레이에 상주시키는 Electron 앱. 최적-EV 헬퍼는 웹 엔진(../src/engine)을 빌드 시 vendor/yd-engine.js 로 번들하고 가치 테이블(../public/V*.bin)을 동봉",
```
`"scripts"` →
```json
  "scripts": {
    "build:engine": "node scripts/build-engine.cjs",
    "prestart": "npm run build:engine",
    "start": "electron .",
    "predist": "npm run build:engine",
    "dist": "electron-builder"
  },
```
`build.files` 에 `"vendor/yd-engine.js"` 추가(`"vendor/supabase.js"` 다음), `build.extraResources` →
```json
    "extraResources": [
      {
        "from": "build/icon.png",
        "to": "icon.png"
      },
      {
        "from": "../public",
        "to": "public",
        "filter": ["V.bin", "V.additional.bin"]
      }
    ],
```

- [ ] **Step 5: `desktop/.gitignore`** 에 한 줄 추가: `vendor/yd-engine.js` (vendor/supabase.js 는 계속 커밋).

- [ ] **Step 6: `desktop/main.js` `setupAutoUpdater`** — 첫 줄(`if (!app.isPackaged) return; …`) 다음에:

```js
  if (process.env.YD_SMOKE) return; // 스모크(패키지 exe 포함)는 업데이트 확인·다운로드 안 함 — 오프라인·결정적 실행.
```

- [ ] **Step 7: CI assert** — `.github/workflows/desktop-release.yml`

Windows 잡: `# 데스크톱은 자립형(popup.html + vendor/supabase.js) — 루트 웹 빌드(../dist) 불필요.` 주석을 다음으로 교체:
```yaml
      # 데스크톱 런타임은 자립형(popup.html + vendor/*) — 루트 웹 빌드(../dist)는 불필요. 단 predist 훅이
      # ../src/engine 을 vendor/yd-engine.js 로 번들하고 ../public/V*.bin 을 extraResources 로 동봉하므로
      # 저장소 전체 체크아웃(actions/checkout 기본값)이 필요하다(#69).
```
`Verify update metadata was generated` 스텝 다음에:
```yaml
      # 헬퍼(#69): 엔진 번들(app.asar 안)과 가치 테이블(resources/public — extraResources)이 실제로 패키지됐는지 확인.
      # electron-builder 는 누락된 files/extraResources 소스를 경고만 하므로 여기서 실패시킨다.
      - name: Verify helper engine + value tables are packaged
        shell: bash
        run: |
          R=release/win-unpacked/resources
          test "$(wc -c < "$R/public/V.bin" | tr -d ' ')" = 1048576 || { echo "::error::resources/public/V.bin 누락 또는 크기 불일치"; exit 1; }
          test "$(wc -c < "$R/public/V.additional.bin" | tr -d ' ')" = 4194304 || { echo "::error::resources/public/V.additional.bin 누락 또는 크기 불일치"; exit 1; }
          node_modules/.bin/asar list "$R/app.asar" | tr '\\' '/' | grep -qx '/vendor/yd-engine.js' || { echo "::error::app.asar 에 vendor/yd-engine.js 가 없습니다"; exit 1; }
```
mac 잡: `Verify dmg was generated` 스텝 다음에:
```yaml
      - name: Verify helper engine + value tables are packaged
        run: |
          R="$(ls -d release/mac*/'Yacht Dice.app'/Contents/Resources 2>/dev/null | head -1)"
          test -n "$R" || { echo "::error::Yacht Dice.app 을 찾지 못했습니다"; exit 1; }
          test "$(wc -c < "$R/public/V.bin" | tr -d ' ')" = 1048576 || { echo "::error::Resources/public/V.bin 누락 또는 크기 불일치"; exit 1; }
          test "$(wc -c < "$R/public/V.additional.bin" | tr -d ' ')" = 4194304 || { echo "::error::Resources/public/V.additional.bin 누락 또는 크기 불일치"; exit 1; }
          node_modules/.bin/asar list "$R/app.asar" | grep -qx '/vendor/yd-engine.js' || { echo "::error::app.asar 에 vendor/yd-engine.js 가 없습니다"; exit 1; }
```

- [ ] **Step 8: 통과 확인**

Run: `cd desktop && npm run build:engine`
Expected: `[build-engine] vendor/yd-engine.js <약 9.5–13 KB> B · 자체 점검 OK`, 종료코드 0, `git status` 에 `vendor/yd-engine.js` 안 보임(gitignore).

Run: `cd desktop && CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist -- --dir --publish never -c.win.signAndEditExecutable=false`
Expected: `release/win-unpacked/resources/public/V.bin`(1048576)·`V.additional.bin`(4194304) 존재, `node_modules/.bin/asar list release/win-unpacked/resources/app.asar` 에 `\vendor\yd-engine.js`. (Step 7 의 Windows assert 스크립트를 그대로 로컬 bash 로 돌려 통과)

- [ ] **Step 9: Commit**

```bash
git add desktop/scripts/build-engine.cjs desktop/package.json desktop/package-lock.json desktop/.gitignore desktop/main.js .github/workflows/desktop-release.yml
git commit -m "build(desktop): 웹 헬퍼 엔진 번들 + 가치 테이블 동봉 (#69)"
```

---

## Task 2: 렌더러 테스트 하네스 + 솔로 헬퍼 표시

**Files:**
- Create: `desktop/scripts/test-helper.cjs`, `desktop/scripts/test-helper.page.js`
- Modify: `desktop/package.json`(`test:helper`), `desktop/popup.html`

**Interfaces:**
- Consumes: `window.YDEngine` (Task 1).
- Produces (popup.html script 1 전역): `ENGINE_IDS`, `helperOn`, `helperUsed`, `HELPER_TABLE`, `helperTables[preset] = {status:'idle'|'loading'|'ready'|'error', advisor, promise}`, `helperLoad(preset): Promise`, `helperRerender()`, `helperMemo`, `helperAdvise(preset, card, dice, rerollsLeft): Advice|null`, `soloEngineCard(): {scores, masterCells}`, `recHoldMarks(adv, dice, held): boolean[5]`, `helperText(adv, dice): string`, `helperIdleText(status, rolled): string`, `setHelperLine(el, text|null, exp, muted)`, `decorateAdvice(adv, dice, held, diceSel, catSel)`, `syncHelperButtons()`, `toggleHelper()`, `isHelperKey(e): boolean`, `renderHelper()`. DOM: `#helper-solo`(버튼), `#helper-line`(`.act`·`.exp`). 테스트: `window.__ydT`(공용 도우미), `window.__ydTest.solo`.

- [ ] **Step 1: 테스트 먼저 — `desktop/scripts/test-helper.cjs`**

```js
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
```

`desktop/package.json` scripts 에 추가: `"test:helper": "npm run build:engine && electron scripts/test-helper.cjs"`

- [ ] **Step 2: 테스트 먼저 — `desktop/scripts/test-helper.page.js`**

```js
// 트레이 헬퍼(#69) 페이지 내부 테스트 — scripts/test-helper.cjs 가 popup.html 에 주입해 단계별로 실행한다.
// popup.html 의 전역(state·render·helper*·mp* 등)을 직접 다룬다. 공용 도우미는 전역 이름 충돌을 피하려
// window.__ydT 하나에, 단계는 window.__ydTest.<단계> 에 둔다. 각 단계는 [{ name, ok, detail }] 를 돌려준다.
window.__ydT = (() => {
  const $ = (s) => document.querySelector(s);
  function collector() {
    const list = [];
    function check(name, cond, detail) {
      list.push(cond ? { name, ok: true } : { name, ok: false, detail: detail === undefined ? undefined : String(detail) });
    }
    return { list, check };
  }
  // 헬퍼 요약 줄 읽기.
  function line(id) {
    const el = $(id);
    return { hidden: el.classList.contains('hidden'), muted: el.classList.contains('muted'), act: el.querySelector('.act').textContent, exp: el.querySelector('.exp').textContent };
  }
  // 창(문서)이 스크롤되지 않는지 — 프레임 없는 고정 크기 창이라 넘치면 스크롤이 생긴다.
  function fits() { const se = document.scrollingElement; return se.scrollHeight <= se.clientHeight && window.scrollY === 0; }
  function sizeOf() { const se = document.scrollingElement; return se.scrollHeight + '/' + se.clientHeight; }
  function key(code, k, extra) {
    document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ code, key: k, bubbles: true, cancelable: true }, extra || {})));
  }
  function setHelper(on) { if (helperOn !== on) toggleHelper(); }
  // 솔로 상태 주입(지정 필드만 덮어씀) 후 다시 그리기.
  function soloState(o) {
    state = Object.assign({ dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false], rolls: 3, rolled: false, filled: {}, master: [], turn: 0 }, o);
    render();
  }
  function marks(sel) { return [...document.querySelectorAll(sel)].map((d) => d.classList.contains('rec')).join(); }
  // fetch 를 가로채 URL 에 needle 이 든 호출 수를 센다(리더보드 등록 2차 방어 검증 — 네트워크 없이).
  function stubFetch(needle) {
    const real = window.fetch;
    const s = { calls: 0, restore() { window.fetch = real; } };
    window.fetch = (url, opts) => {
      if (String(url).includes(needle)) { s.calls++; return Promise.resolve(new Response('{}', { status: 200 })); }
      return real(url, opts);
    };
    return s;
  }
  return { $, collector, line, fits, sizeOf, key, setHelper, soloState, marks, stubFetch };
})();
window.__ydTest = window.__ydTest || {};

// ── 단계 solo: 표시·값·표시자·레이아웃·H 키·비정상 입력·로드 실패 (270×358) ──
window.__ydTest.solo = async () => {
  const { $, collector, line, fits, sizeOf, key, setHelper, soloState, marks } = window.__ydT;
  const { list, check } = collector();
  showScreen('solo');
  document.documentElement.dataset.theme = 'dark';

  // 0) 엔진 번들 + 카테고리 순서(V.bin 비트 인덱스) 일치
  check('엔진 번들 로드', typeof window.YDEngine === 'object' && typeof YDEngine.createAdvisor === 'function');
  check('ENGINE_IDS = CATEGORY_IDS', !!window.YDEngine && YDEngine.CATEGORY_IDS.join() === ENGINE_IDS.join());

  // 1) 기본 OFF — 줄 숨김, 버튼 ◇
  setSoloPreset('default');
  setHelper(false);
  check('OFF: 헬퍼 줄 숨김', line('#helper-line').hidden);
  check('OFF: 버튼 ◇ · aria-pressed=false', $('#helper-solo').textContent.includes('◇') && $('#helper-solo').getAttribute('aria-pressed') === 'false');

  // 2) ON — 저장 + (첫 로드 중) 로딩 문구 → 로드 완료 후 굴리기 전 안내
  setHelper(true);
  check('ON: yd_helper=1 저장', localStorage.getItem('yd_helper') === '1');
  check('ON: 버튼 ◆ · on', $('#helper-solo').textContent.includes('◆') && $('#helper-solo').classList.contains('on'));
  check('ON 직후: 로딩 문구', line('#helper-line').act === '헬퍼 데이터 로딩 중…', line('#helper-line').act);
  await helperLoad('default');
  check('기본 테이블 ready', helperTables.default.status === 'ready', helperTables.default.status);
  let L = line('#helper-line');
  check('굴리기 전: 안내 문구(흐림)', !L.hidden && L.muted && L.act === '주사위를 굴리면 최적의 수를 추천해 드려요.', L.act);

  // 3) 리롤 추천 — 기본 룰 빈 카드 [1,2,3,4,6], 굴림 2회 남음(엔진: 1·2·3·4 보관, +3.9192, 188.9306)
  soloState({ dice: [1, 2, 3, 4, 6], rolls: 2, rolled: true });
  L = line('#helper-line');
  check('리롤 문구', L.act === '1, 2, 3, 4 보관하고 다시 굴리기 · +3.9', L.act);
  check('예상 189', L.exp === '예상 189', L.exp);
  check('추천 보관 밑줄 1~4번', marks('#dice .die') === 'true,true,true,true,false', marks('#dice .die'));
  check('리롤 추천 땐 칸 표시 없음', document.querySelectorAll('#cats .cat.rec').length === 0);

  // 4) 다중집합 표시 — [1,1,2,3,4] 는 1을 하나만 보관(엔진 hold 10111). 두 번째 1을 이미 고정했으면 그쪽을 표시.
  soloState({ dice: [1, 1, 2, 3, 4], held: [false, true, false, false, false], rolls: 2, rolled: true });
  check('이미 고정한 같은 눈 우선 표시', marks('#dice .die') === 'false,true,true,true,true', marks('#dice .die'));

  // 5) 지금 기록 — [6,6,6,6,6], 굴림 0회 남음 → 요트 50(엔진 225.3394)
  soloState({ dice: [6, 6, 6, 6, 6], rolls: 0, rolled: true });
  L = line('#helper-line');
  check('지금 기록 문구', L.act === '지금 요트에 기록 · 50점', L.act);
  check('예상 225', L.exp === '예상 225', L.exp);
  check('요트 칸만 테두리', document.querySelectorAll('#cats .cat')[11].classList.contains('rec') && document.querySelectorAll('#cats .cat.rec').length === 1);
  check('지금 기록 땐 주사위 표시 없음', document.querySelectorAll('#dice .die.rec').length === 0);

  // 6) 추가 룰 — 요트의 달인 칸은 masterCells 에만(엔진 357.106; 순진 변환이면 492)
  setSoloPreset('additional');
  await helperLoad('additional');
  check('추가 테이블 ready', helperTables.additional.status === 'ready', helperTables.additional.status);
  soloState({ dice: [2, 3, 4, 5, 5], rolls: 1, rolled: true, filled: { yacht: 50, sixes: 100, fourkind: 24 }, master: ['sixes'], turn: 3 });
  check('어댑터: 달인 칸 분리', JSON.stringify(soloEngineCard()) === JSON.stringify({ scores: { fourKind: 24, yacht: 50 }, masterCells: ['sixes'] }), JSON.stringify(soloEngineCard()));
  L = line('#helper-line');
  check('추가 룰 문구', L.act === '2, 3, 4, 5 보관하고 다시 굴리기 · +7.3', L.act);
  check('추가 룰 예상 357', L.exp === '예상 357', L.exp);

  // 7) 요트의 달인 윈드폴 — 요트 50 기록 + 5개 같은 눈 → 원 칸에 +100(엔진 360.5238)
  soloState({ dice: [3, 3, 3, 3, 3], rolls: 2, rolled: true, filled: { yacht: 50 }, turn: 1 });
  L = line('#helper-line');
  check('윈드폴 문구', L.act === '요트의 달인! 원 칸에 기록 · +100', L.act);
  check('윈드폴 예상 361', L.exp === '예상 361', L.exp);
  check('윈드폴 칸 테두리(원)', document.querySelectorAll('#cats .cat')[0].classList.contains('rec'));

  // 8) 레이아웃 — 두 테마 × 최악 상태들(추가 룰 힌트 + 헬퍼 줄)
  const layoutStates = [
    ['추가 룰 4/4 ✓ +50 + 헬퍼', 'additional', { dice: [2, 3, 4, 5, 5], rolls: 1, rolled: true, filled: { fourkind: 24, fullhouse: 25, small: 15, large: 30 }, turn: 4 }],
    ['추가 룰 달인 안내 + 헬퍼', 'additional', { dice: [3, 3, 3, 3, 3], rolls: 2, rolled: true, filled: { yacht: 50 }, turn: 1 }],
    ['기본 룰 리롤 + 헬퍼', 'default', { dice: [1, 2, 3, 4, 6], rolls: 2, rolled: true }],
  ];
  for (const theme of ['dark', 'light']) {
    document.documentElement.dataset.theme = theme;
    for (const [name, preset, st] of layoutStates) {
      if (soloPreset !== preset) setSoloPreset(preset);
      await helperLoad(preset);
      soloState(st);
      check(`레이아웃 ${theme} · ${name}: 스크롤 없음`, fits() && !line('#helper-line').hidden, sizeOf());
    }
  }
  document.documentElement.dataset.theme = 'dark';

  // 9) H 키 — 토글, Ctrl+H 무시, 한글 IME('ㅗ'·Process 조합)도 동작, 물리 H 가 'y' 를 내면(비QWERTY) 식스 단축키 우선
  setSoloPreset('default');
  setHelper(false);
  key('KeyH', 'h');
  check('H → ON', helperOn === true);
  key('KeyH', 'h', { ctrlKey: true });
  check('Ctrl+H 무시', helperOn === true);
  key('KeyH', 'ㅗ');
  check('IME ㅗ(KeyH) → OFF', helperOn === false);
  key('KeyH', 'Process', { isComposing: true });
  check('IME 조합 중(Process) → ON', helperOn === true);
  setHelper(false);
  soloState({ dice: [6, 6, 6, 1, 2], rolls: 2, rolled: true });
  key('KeyH', 'y');
  check("물리 H 가 'y' → 식스 기록(토글 안 함)", state.filled.sixes === 18 && helperOn === false, JSON.stringify(state.filled));
  $('#over').classList.remove('hidden');
  key('KeyH', 'h');
  check('게임오버 오버레이 중 H 무시', helperOn === false);
  $('#over').classList.add('hidden');

  // 10) 비정상 엔진 입력 — 조언 null, 예외 없음
  await helperLoad('default');
  let threw = false, r1, r2, r3;
  try {
    r1 = helperAdvise('default', { scores: {}, masterCells: [] }, [0, 0, 0, 0, 0], 2);
    r2 = helperAdvise('default', { scores: {}, masterCells: [] }, [], 2);
    r3 = helperAdvise('default', { scores: {}, masterCells: [] }, [1, 2, 3, 4, 5], 3);
  } catch (_) { threw = true; }
  check('비정상 입력: null · 예외 없음', !threw && r1 === null && r2 === null && r3 === null, JSON.stringify([threw, r1, r2, r3]));

  // 11) 로드 실패 — 테이블이 없으면 오류 문구, 게임은 계속
  const savedUrl = HELPER_TABLE.additional.url;
  HELPER_TABLE.additional.url = '../public/__missing__.bin';
  helperTables.additional = { status: 'idle', advisor: null, promise: null };
  setHelper(true);
  setSoloPreset('additional');
  await helperLoad('additional');
  L = line('#helper-line');
  check('로드 실패: 오류 문구(흐림)', helperTables.additional.status === 'error' && L.act === '헬퍼 데이터를 불러오지 못했습니다' && L.muted, L.act);
  soloState({ dice: [1, 2, 3, 4, 5], rolls: 2, rolled: true });
  check('로드 실패여도 12칸 기록 가능', document.querySelectorAll('#cats .cat.able').length === 12);
  HELPER_TABLE.additional.url = savedUrl;
  helperTables.additional = { status: 'idle', advisor: null, promise: null };

  // 정리
  setHelper(false);
  setSoloPreset('default');
  return list;
};
```

- [ ] **Step 3: 실패 확인**

Run: `cd desktop && npm run test:helper`
Expected: FAIL(종료코드 1) — `엔진 번들 로드`(스크립트 태그 없음), `ENGINE_IDS`/`toggleHelper` 미정의 등 다수 ✗ 또는 `ERROR ReferenceError …`.

- [ ] **Step 4: popup.html — CSS + 엔진 스크립트 태그**

찾기:
```html
      .avg-inc { font-size: 12px; color: var(--mut); display: flex; gap: 6px; align-items: center; justify-content: center; }
    </style>
    <script src="./vendor/supabase.js"></script>
```
바꾸기:
```html
      .avg-inc { font-size: 12px; color: var(--mut); display: flex; gap: 6px; align-items: center; justify-content: center; }

      /* ── 헬퍼(최적 EV, #69) — 무채색만. 추천 보관 = 주사위 밑줄, 추천 기록 칸 = 진한 테두리, 요약 1줄 ── */
      .die.rec::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: 3px; height: 2px; border-radius: 1px; background: var(--emph); }
      .cat.rec, .cat.master.rec { border-color: var(--emph); }
      .helper-line { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 18px; padding: 2px 1px 1px; font-size: 10px; color: var(--emph); border-top: 1px dashed var(--line); }
      .helper-line.muted { color: var(--mut); }
      .helper-line .act { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .helper-line .exp { flex: none; color: var(--mut); font-variant-numeric: tabular-nums; }
      .helper-toggle.on { color: var(--emph); }
    </style>
    <script src="./vendor/supabase.js"></script>
    <!-- 헬퍼 엔진(#69) — 웹 src/engine 번들(npm run build:engine 생성, gitignore). 없으면 헬퍼만 오류 표시. -->
    <script src="./vendor/yd-engine.js"></script>
```

- [ ] **Step 5: popup.html — 헤더 토글 버튼 + 요약 줄 마크업**

찾기: `          <button class="x" id="lb-open" title="리더보드" tabindex="-1">🏆</button>`
바꾸기:
```html
          <button class="x helper-toggle" id="helper-solo" title="헬퍼 켜기 (H)" tabindex="-1" aria-pressed="false"><span class="k">H</span>◇</button>
          <button class="x" id="lb-open" title="리더보드" tabindex="-1">🏆</button>
```
찾기:
```html
        <button class="new" id="new" title="새로" tabindex="-1">↺ 새로</button>
      </div>
    </div>
```
바꾸기:
```html
        <button class="new" id="new" title="새로" tabindex="-1">↺ 새로</button>
      </div>
      <div class="helper-line hidden" id="helper-line"><span class="act"></span><span class="exp"></span></div>
    </div>
```

- [ ] **Step 6: popup.html — `helperUsed` + 헬퍼 모듈 + reset 초기화**

찾기:
```js
      let undoUsed = false; // 이번 게임에서 되돌리기를 한 번이라도 썼는지(리더보드 실격).
      function reset() {
        state = { dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false], rolls: 3, rolled: false, filled: {}, master: [], turn: 0 };
        history = [];
        undoUsed = false;
```
바꾸기:
```js
      let undoUsed = false; // 이번 게임에서 되돌리기를 한 번이라도 썼는지(리더보드 실격).
      // 이번 게임에 헬퍼 조언이 '표시'된 적 있는지(리더보드·평균 제외, 웹 helperUsedThisGame 대응).
      // undoUsed 와 같은 이유로 state 밖 — 되돌리기 스냅샷 복원으로 풀리면 안 된다. reset() 에서만 해제.
      let helperUsed = false;

      // ── 헬퍼(최적 EV, #69) — 웹 엔진 번들(vendor/yd-engine.js → 전역 YDEngine)을 그대로 쓴다 ──
      // 엔진 카테고리 id = 웹 CATEGORY_IDS 순서(= V.bin 비트 인덱스)이며 CATS 와 인덱스 1:1 대응.
      // (2번째 스크립트의 TO_SERVER 는 이 스크립트의 첫 render() 시점에 아직 없으므로 따로 둔다.)
      const ENGINE_IDS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
      const HELPER_KEY = 'yd_helper'; // 헬퍼 ON/OFF 기억('1'/'0', 첫 실행 OFF) — 솔로·멀티 공용
      let helperOn = (function () { try { return localStorage.getItem(HELPER_KEY) === '1'; } catch (_) { return false; } })();
      // 프리셋별 가치 테이블(설치본: extraResources → resources/public, dev: 저장소 public/ — 같은 상대 URL).
      // 테이블↔룰 짝은 절대 교차 금지(createAdvisor 는 검증하지 않음). sanity = 빈 카드 상태값(룰/테이블 뒤바뀜 감지).
      const HELPER_TABLE = {
        default: { url: '../public/V.bin', count: 'STATE_COUNT', rules: 'DEFAULT_RULES', sanity: [0, 191.7609] },
        additional: { url: '../public/V.additional.bin', count: 'STATE_COUNT_ADDITIONAL', rules: 'ADDITIONAL_RULES', sanity: [1, 227.2057] },
      };
      const helperTables = {
        default: { status: 'idle', advisor: null, promise: null },
        additional: { status: 'idle', advisor: null, promise: null },
      };
      // 테이블 지연 로드(프리셋당 1회). 완료되면 보이는 화면을 다시 그린다. file:// 에서 누락 파일은 404 가 아니라
      // TypeError 로 reject 되므로 catch 로 'error' 처리 — 게임은 계속 동작한다.
      function helperLoad(preset) {
        const t = helperTables[preset];
        if (t.promise) return t.promise;
        const spec = HELPER_TABLE[preset];
        t.status = 'loading';
        t.promise = (async () => {
          const E = window.YDEngine;
          if (!E) throw new Error('엔진 번들(vendor/yd-engine.js) 없음');
          if (E.CATEGORY_IDS.join() !== ENGINE_IDS.join()) throw new Error('카테고리 순서 불일치');
          const res = await fetch(spec.url);
          if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + spec.url);
          const V = new Float32Array(await res.arrayBuffer());
          if (V.length !== E[spec.count]) throw new Error('테이블 크기 불일치: ' + V.length);
          if (!(Math.abs(V[spec.sanity[0]] - spec.sanity[1]) < 0.01)) throw new Error('테이블 값 점검 실패');
          const advisor = E.createAdvisor(V, E[spec.rules]);
          advisor.advise({ scores: {}, masterCells: [] }, [1, 2, 3, 4, 5], 2); // JIT 워밍업(첫 굴림 지연 방지)
          t.advisor = advisor;
          t.status = 'ready';
        })()
          .catch((e) => { console.error('[helper]', e); t.status = 'error'; })
          .then(helperRerender);
        return t.promise;
      }
      // 보이는 화면만 다시 그린다 — 숨은 솔로 보드에 조언이 '표시'돼 실격되는 일을 막는다.
      function helperRerender() {
        if (!document.getElementById('app').classList.contains('hidden')) render();
        else if (typeof currentScreenName === 'function' && currentScreenName() === 'mp-game') renderMpGame();
      }
      // 값 기준 메모 — 같은 프리셋·카드·주사위·남은 굴림이면 재계산하지 않는다(멀티는 이벤트마다 객체가 새로 생김).
      let helperMemo = { key: '', adv: null };
      // 조언 계산. 준비 안 됨·입력 비정상·카드 완료면 null. 엔진 예외는 삼켜 render 를 절대 깨지 않는다.
      function helperAdvise(preset, card, dice, rerollsLeft) {
        const t = helperTables[preset];
        if (!t || t.status !== 'ready') return null;
        if (!Array.isArray(dice) || dice.length !== 5 || !dice.every((v) => Number.isInteger(v) && v >= 1 && v <= 6)) return null;
        if (![0, 1, 2].includes(rerollsLeft)) return null;
        if (Object.keys(card.scores).length + card.masterCells.length >= 12) return null;
        const key = preset + '|' + JSON.stringify(card) + '|' + dice.join(',') + '|' + rerollsLeft;
        if (helperMemo.key !== key) {
          let adv = null;
          try { adv = t.advisor.advise(card, dice, rerollsLeft); } catch (e) { console.error('[helper]', e); }
          helperMemo = { key, adv };
        }
        return helperMemo.adv;
      }
      // 트레이 솔로 상태 → 엔진 Scorecard. 요트의 달인 칸은 filled[id]=100 + master 로 저장되므로 masterCells 에만
      // 넣고 scores 에서는 뺀다(넣으면 상단 소계·총점이 오염돼 '그럴듯하지만 틀린' 조언이 된다).
      function soloEngineCard() {
        const scores = {}, masterCells = [];
        CATS.forEach((c, i) => {
          if (state.master.includes(c.id)) masterCells.push(ENGINE_IDS[i]);
          else if (state.filled[c.id] != null) scores[ENGINE_IDS[i]] = state.filled[c.id];
        });
        return { scores, masterCells };
      }
      // 추천 보관 표시는 위치가 아닌 '눈 다중집합' 기준 — 같은 눈을 이미 고정한 주사위를 우선 표시.
      function recHoldMarks(adv, dice, held) {
        const need = [0, 0, 0, 0, 0, 0, 0];
        adv.holdMask.forEach((h, i) => { if (h) need[dice[i]]++; });
        const mark = [false, false, false, false, false];
        [true, false].forEach((wantHeld) => dice.forEach((v, i) => {
          if (!mark[i] && need[v] > 0 && !!held[i] === wantHeld) { mark[i] = true; need[v]--; }
        }));
        return mark;
      }
      // 요약 문구 — 웹 HelperPanel 과 같은 우선순위(요트의 달인 > 지금 기록 > 보관 후 다시 굴리기).
      function helperText(adv, dice) {
        const idx = ENGINE_IDS.indexOf(adv.bestCategory);
        const nm = idx >= 0 ? CATS[idx].nm : String(adv.bestCategory);
        if (adv.windfall && adv.windfall.active) return '요트의 달인! ' + nm + ' 칸에 기록 · +' + adv.windfall.bonus;
        if (adv.recommendScoreNow) return '지금 ' + nm + '에 기록 · ' + adv.bestCategoryScoreNow + '점';
        const kept = dice.filter((_, i) => adv.holdMask[i]);
        return (kept.length ? kept.join(', ') + ' 보관하고 다시 굴리기' : '모두 다시 굴리기') + ' · +' + adv.evGainFromReroll.toFixed(1);
      }
      // 대기 문구(흐림). rolled = 이번 턴에 굴렸는지.
      function helperIdleText(status, rolled) {
        if (status === 'error') return '헬퍼 데이터를 불러오지 못했습니다';
        if (status !== 'ready') return '헬퍼 데이터 로딩 중…';
        return rolled ? '추천을 계산하지 못했습니다' : '주사위를 굴리면 최적의 수를 추천해 드려요.';
      }
      // 요약 줄 갱신. text 가 null 이면 숨김.
      function setHelperLine(el, text, exp, muted) {
        el.classList.toggle('hidden', text == null);
        if (text == null) return;
        el.classList.toggle('muted', !!muted);
        el.querySelector('.act').textContent = text;
        el.querySelector('.exp').textContent = exp || '';
        el.title = exp ? text + ' · ' + exp : text; // 잘렸을 때 전체 문구
      }
      // 추천을 보드에 덧입힌다(render 가 주사위·칸을 매번 새로 그리므로 그 뒤에 호출).
      function decorateAdvice(adv, dice, held, diceSel, catSel) {
        if ((adv.windfall && adv.windfall.active) || adv.recommendScoreNow) {
          const c = document.querySelectorAll(catSel)[ENGINE_IDS.indexOf(adv.bestCategory)];
          if (c) c.classList.add('rec');
        } else {
          const m = recHoldMarks(adv, dice, held);
          document.querySelectorAll(diceSel).forEach((d, i) => { if (m[i]) d.classList.add('rec'); });
        }
      }
      function syncHelperButtons() {
        document.querySelectorAll('.helper-toggle').forEach((b) => {
          b.classList.toggle('on', helperOn);
          b.innerHTML = '<span class="k">H</span>' + (helperOn ? '◆' : '◇');
          b.title = helperOn ? '헬퍼 끄기 (H)' : '헬퍼 켜기 (H) — 조언이 표시된 게임은 리더보드·평균 제외';
          b.setAttribute('aria-pressed', helperOn ? 'true' : 'false');
        });
      }
      function toggleHelper() {
        helperOn = !helperOn;
        try { localStorage.setItem(HELPER_KEY, helperOn ? '1' : '0'); } catch (_) {}
        syncHelperButtons();
        helperRerender();
      }
      // H 단축키 — 물리 키(e.code) 기준이라 한글 IME 에서도 동작. Ctrl/Alt/Meta 조합은 무시.
      // 비QWERTY 배열에서 이 키가 칸/주사위 단축키 문자를 내면(예: Workman 의 'y' = 식스) 기존 단축키가 우선.
      function isHelperKey(e) {
        if (e.code !== 'KeyH' || e.ctrlKey || e.altKey || e.metaKey) return false;
        const k = String(e.key || '').toLowerCase();
        return !CAT_KEYS.includes(k) && !HOLD_KEYS.includes(k);
      }
      // render() 끝에서 호출. 조언이 '실제로 표시되는 순간' helperUsed 를 켠다(웹 App.tsx 의 markHelperUsed 와 같은 시점).
      function renderHelper() {
        const line = document.getElementById('helper-line');
        if (!line) return;
        if (!helperOn || state.turn >= 12) { setHelperLine(line, null); return; }
        helperLoad(soloPreset); // 처음이면 로드 시작(완료 시 helperRerender)
        const adv = state.rolled ? helperAdvise(soloPreset, soloEngineCard(), state.dice, state.rolls) : null;
        if (!adv) { setHelperLine(line, helperIdleText(helperTables[soloPreset].status, state.rolled), '', true); return; }
        helperUsed = true;
        decorateAdvice(adv, state.dice, state.held, '#dice .die', '#cats .cat');
        setHelperLine(line, helperText(adv, state.dice), '예상 ' + Math.round(adv.expectedFinalScore));
      }

      function reset() {
        state = { dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false], rolls: 3, rolled: false, filled: {}, master: [], turn: 0 };
        history = [];
        undoUsed = false;
        helperUsed = false;
```

- [ ] **Step 7: popup.html — render 훅, 버튼 배선, H 키(솔로)**

찾기:
```js
        document.getElementById('turn').textContent = `${Math.min(state.turn + 1, 12)} / 12`;
      }
```
바꾸기:
```js
        document.getElementById('turn').textContent = `${Math.min(state.turn + 1, 12)} / 12`;
        renderHelper(); // 헬퍼 요약 줄·표시(#69) — #dice/#cats 를 다시 그린 뒤 덧입힌다.
      }
```
찾기: `      document.getElementById('close').onclick = hidePopup;`
바꾸기:
```js
      document.getElementById('close').onclick = hidePopup;
      document.getElementById('helper-solo').onclick = toggleHelper;
      syncHelperButtons(); // 저장된 헬퍼 ON/OFF 를 헤더 버튼에 반영
```
찾기:
```js
        const ci = CAT_KEYS.indexOf(e.key.toLowerCase());
        if (ci >= 0) { e.preventDefault(); pick(CATS[ci]); return; }
      });
```
바꾸기:
```js
        const ci = CAT_KEYS.indexOf(e.key.toLowerCase());
        if (ci >= 0) { e.preventDefault(); pick(CATS[ci]); return; }
        // 헬퍼 토글(H) — 칸/주사위 키 뒤에 둬 비QWERTY 배열의 기존 단축키를 빼앗지 않는다(isHelperKey 참고).
        if (isHelperKey(e)) { e.preventDefault(); toggleHelper(); return; }
      });
```

- [ ] **Step 8: 통과 확인**

Run: `cd desktop && npm run test:helper`
Expected: `[test-helper] N/N 통과`(solo 단계 전부 ✓), 종료코드 0.

- [ ] **Step 9: Commit**

```bash
git add desktop/scripts/test-helper.cjs desktop/scripts/test-helper.page.js desktop/package.json desktop/popup.html
git commit -m "feat(desktop): 트레이 솔로 헬퍼 표시 + 숨은 창 렌더러 테스트 (#69)"
```

---

## Task 3: 솔로 거버넌스(리더보드·평균 게이트)

**Files:**
- Modify: `desktop/popup.html`, `desktop/scripts/test-helper.page.js`

**Interfaces:**
- Consumes: `helperUsed`, `toggleHelper`, `helperLoad`, `window.__ydT` (Task 2).
- Produces: `disqualifyReason(): string`, `window.__ydTest.governance`.

- [ ] **Step 1: 테스트 먼저 — `test-helper.page.js` 끝에 추가**

```js
// ── 단계 governance: 실격 시점·유지·해제, 게임오버·평균·등록 2차 방어 (270×358) ──
window.__ydTest.governance = async () => {
  const { $, collector, key, setHelper, soloState, stubFetch } = window.__ydT;
  const { list, check } = collector();
  showScreen('solo');
  setSoloPreset('default');
  setHelper(false);
  await helperLoad('default');
  const ELEVEN = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, choice: 20, fourkind: 20, fullhouse: 20, small: 15, large: 30 };
  const bucket = () => JSON.stringify(avgStats['solo:default']);

  // a) 굴리기 전 ON→OFF 는 실격 아님(조언이 표시된 적 없음)
  reset();
  setHelper(true);
  setHelper(false);
  key('Space', ' ');
  check('굴리기 전 켰다 끄면 실격 아님', helperUsed === false && state.rolled === true);
  // b) 굴린 상태에서 ON → 조언이 표시되는 순간 실격
  setHelper(true);
  check('조언 표시 → helperUsed', helperUsed === true);
  // c) OFF 해도 유지
  setHelper(false);
  check('OFF 후에도 유지', helperUsed === true);
  // d) 되돌리기로 안 풀림
  pick(CATS[6]);
  undo();
  check('되돌리기 후에도 유지', helperUsed === true && undoUsed === true);
  // e) 새 게임·룰 전환(reset)으로만 해제
  $('#new').click();
  check('새 게임 → 해제', helperUsed === false && undoUsed === false);
  soloState({ dice: [1, 2, 3, 4, 6], rolls: 2, rolled: true });
  setHelper(true);
  check('(룰 전환 전) 실격', helperUsed === true);
  setSoloPreset('additional');
  check('룰 전환 → 해제', helperUsed === false);
  setSoloPreset('default');
  setHelper(false);

  // f) 게임오버 — 헬퍼 사용 게임: 등록 UI 숨김 + 사유, 평균 미집계 + 배지, submitScore 2차 방어
  reset();
  avgIncludeThisGame = true;
  soloState({ dice: [6, 6, 6, 6, 6], rolls: 2, rolled: true, filled: { ...ELEVEN }, turn: 11 });
  setHelper(true); // 조언 표시 → 실격
  check('(게임오버 전) 실격', helperUsed === true);
  let before = bucket();
  pick(CATS[11]); // 요트 → 12칸 → gameOver
  check('게임오버 표시', !$('#over').classList.contains('hidden'));
  check('등록 UI 숨김', $('#lb-name').style.display === 'none' && $('#lb-submit').style.display === 'none');
  check('사유: 헬퍼 사용', $('#lb-msg').textContent === '헬퍼 사용 — 리더보드 등록 제외', $('#lb-msg').textContent);
  check('평균 미집계', avgCounted === false && bucket() === before, bucket());
  check('평균 배지: 헬퍼', $('#avg-line').textContent.endsWith('평균 미반영(헬퍼)'), $('#avg-line').textContent);
  const net = stubFetch('submit_score');
  $('#lb-name').value = 'tester';
  await submitScore();
  check('submitScore 2차 방어(네트워크 호출 0)', net.calls === 0, net.calls);
  net.restore();
  // g) 헬퍼 + 되돌리기 사유
  undo(); // 게임오버에서 되돌리기 → 12번째 턴 복귀(undoUsed)
  pick(CATS[11]);
  check('사유: 헬퍼·되돌리기', $('#lb-msg').textContent === '헬퍼·되돌리기 사용 — 리더보드 등록 제외', $('#lb-msg').textContent);
  check('평균 배지: 헬퍼·되돌리기', $('#avg-line').textContent.endsWith('평균 미반영(헬퍼·되돌리기)'), $('#avg-line').textContent);
  // h) 부분 반영(중도 '새로')도 제외 — 3칸 이상 진행 + 포함 ON 이어도
  reset();
  avgIncludeThisGame = true;
  soloState({ dice: [1, 1, 2, 3, 4], rolls: 2, rolled: true, filled: { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15 }, turn: 5 });
  check('(부분 반영 전) 실격', helperUsed === true);
  before = bucket();
  $('#new').click(); // avgCommitOutgoing → 헬퍼 게임이라 건너뜀
  check('부분 반영 제외', bucket() === before, bucket());
  // i) 대조군 — 헬퍼 미사용 게임은 정상(등록 UI 노출 + 평균 반영)
  setHelper(false);
  reset();
  avgIncludeThisGame = true;
  soloState({ dice: [6, 6, 6, 6, 6], rolls: 2, rolled: true, filled: { ...ELEVEN }, turn: 11 });
  before = bucket();
  pick(CATS[11]);
  check('대조: 등록 UI 노출', $('#lb-name').style.display === '' && $('#lb-msg').textContent === '');
  check('대조: 평균 반영', avgCounted === true && bucket() !== before, bucket());
  check('대조: 배지 반영됨', $('#avg-line').textContent.endsWith('평균 반영됨'), $('#avg-line').textContent);

  // 정리
  reset();
  setHelper(false);
  return list;
};
```

- [ ] **Step 2: 실패 확인**

Run: `cd desktop && npm run test:helper`
Expected: FAIL — `[governance] 사유: 헬퍼 사용`(현재 `↩ 되돌리기 …` 아님/빈 문자열), `등록 UI 숨김`, `평균 미집계`, `submitScore 2차 방어`, `부분 반영 제외` 등 ✗.

- [ ] **Step 3: popup.html — 게이트 6곳**

(1) 찾기:
```js
      // 진행 중·미기록·순수(되돌리기 미사용)·floor·포함이면 현재 부분 점수를 solo 버킷에 기록.
      function avgCommitOutgoing() {
        if (avgCounted || !avgIncludeThisGame || undoUsed) return;
```
바꾸기:
```js
      // 진행 중·미기록·순수(되돌리기·헬퍼 미사용)·floor·포함이면 현재 부분 점수를 solo 버킷에 기록.
      function avgCommitOutgoing() {
        if (avgCounted || !avgIncludeThisGame || undoUsed || helperUsed) return;
```
(2) 찾기: `      let lbSubmitted = false; // 이번 게임 점수를 이미(또는 진행 중) 등록했는지 — 중복 등록 방지.`
바꾸기:
```js
      let lbSubmitted = false; // 이번 게임 점수를 이미(또는 진행 중) 등록했는지 — 중복 등록 방지.
      // 리더보드 실격 사유(게임오버 문구). 되돌리기만 썼으면 기존 문구 그대로.
      function disqualifyReason() {
        return helperUsed && undoUsed ? '헬퍼·되돌리기 사용' : helperUsed ? '헬퍼 사용' : '↩ 되돌리기 사용';
      }
```
(3) 찾기: `        if (avgIncludeThisGame && !avgCounted && !undoUsed) {`
바꾸기: `        if (avgIncludeThisGame && !avgCounted && !undoUsed && !helperUsed) {`
(4) 찾기:
```js
        // 리더보드 등록 UI 초기화. 단, 되돌리기를 쓴 게임은 등록 실격(웹 undoUsedThisGame 대응).
```
바꾸기:
```js
        // 리더보드 등록 UI 초기화. 단, 되돌리기·헬퍼를 쓴 게임은 등록 실격(웹 undoUsedThisGame·helperUsedThisGame 대응).
```
찾기:
```js
        if (undoUsed) {
          if (nm) nm.style.display = 'none';
          if (btn) btn.style.display = 'none';
          if (msg) msg.textContent = '↩ 되돌리기 사용 — 리더보드 등록 제외';
```
바꾸기:
```js
        if (undoUsed || helperUsed) {
          if (nm) nm.style.display = 'none';
          if (btn) btn.style.display = 'none';
          if (msg) msg.textContent = disqualifyReason() + ' — 리더보드 등록 제외';
```
(5) 찾기: `        var badge = avgCounted ? '평균 반영됨' : (avgIncludeThisGame ? '평균 미반영(되돌리기)' : '평균 미반영(연습)');`
바꾸기:
```js
        // 포함 ON 인데 미반영 = 헬퍼·되돌리기를 쓴(순수하지 않은) 게임.
        var why = helperUsed && undoUsed ? '헬퍼·되돌리기' : helperUsed ? '헬퍼' : '되돌리기';
        var badge = avgCounted ? '평균 반영됨' : (avgIncludeThisGame ? '평균 미반영(' + why + ')' : '평균 미반영(연습)');
```
(6) 찾기:
```js
        // 되돌리기를 쓴 게임은 등록 실격 — UI 숨김이 우회돼도 서버 등록 차단(2차 방어).
        if (undoUsed) return;
```
바꾸기:
```js
        // 되돌리기·헬퍼를 쓴 게임은 등록 실격 — UI 숨김이 우회돼도 서버 등록 차단(2차 방어, 서버는 검증 불가).
        if (undoUsed || helperUsed) return;
```

- [ ] **Step 4: 통과 확인**

Run: `cd desktop && npm run test:helper`
Expected: solo + governance 전부 ✓, 종료코드 0.

- [ ] **Step 5: Commit**

```bash
git add desktop/popup.html desktop/scripts/test-helper.page.js
git commit -m "feat(desktop): 헬퍼 사용 솔로 게임 리더보드·평균 제외 — 웹과 동일 규칙 (#69)"
```

---

## Task 4: 멀티(헬퍼 허용 방) — 표시·방 만들기·로비 줄·게임오버 게이트

**Files:**
- Modify: `desktop/popup.html`, `desktop/scripts/test-helper.page.js`

**Interfaces:**
- Consumes: `helperOn`, `helperLoad`, `helperAdvise`, `helperIdleText`, `helperText`, `setHelperLine`, `decorateAdvice`, `isHelperKey`, `toggleHelper`, `helperTables`, `helperMemo` (Task 2), script 2 `mpRoom`/`mpPlayers`/`mySeat`/`mySc()`/`myMaster()`.
- Produces: `renderMpHelper()`, `mpCreateHelper`, `syncMpHelperChip()`, DOM `#mp-helper-line`·`#mp-helper-toggle`, `window.__ydTest.mp`.

- [ ] **Step 1: 테스트 먼저 — `test-helper.page.js` 끝에 추가**

```js
// ── 단계 mp: 표시 조건·값·메모·H 키·레이아웃·로비 줄·방 만들기·게임오버 게이트 (270×380) ──
window.__ydTest.mp = async () => {
  const { $, collector, line, fits, sizeOf, key, setHelper, marks, stubFetch } = window.__ydT;
  const { list, check } = collector();
  setHelper(true);
  await helperLoad('default');
  helperUsed = false; // 멀티가 솔로 실격 플래그를 건드리지 않는지 확인용
  // 서버 응답 모양 그대로 상태 주입(네트워크 없음)
  mpUserId = 'u-me';
  mpPlayers = [
    { id: 'p0', userId: 'u-me', seat: 0, displayName: '나', isHost: true, connected: true, scorecard: { scores: { ones: 3, twos: 6, choice: 22 } } },
    { id: 'p1', userId: 'u-op', seat: 1, displayName: '상대', isHost: false, connected: true, scorecard: { scores: {} } },
  ];
  recomputeMySeat();
  const baseRoom = { id: 'r1', code: 'ABC123', status: 'playing', helperAllowed: true, rulePreset: 'default', maxPlayers: 4, hostId: 'u-me', currentSeat: 0, round: 3, dice: [2, 3, 3, 5, 6], held: [false, false, false, false, false], rollsUsed: 1, winnerSeat: null, isTie: false };
  mpRoom = { ...baseRoom };
  showScreen('mp-game');
  renderMpGame();

  // 1) 허용 방 + 내 차례 + ON → 조언(엔진: 3·3 보관, +10.484, 166.7858)
  let L = line('#mp-helper-line');
  check('멀티 조언 문구', !L.hidden && L.act === '3, 3 보관하고 다시 굴리기 · +10.5', L.act);
  check('멀티 예상 167', L.exp === '예상 167', L.exp);
  check('멀티 추천 보관 밑줄', marks('#mp-dice .die') === 'false,true,true,false,false', marks('#mp-dice .die'));
  check('멀티는 솔로 helperUsed 안 건드림', helperUsed === false);
  // 2) 메모 유지 — Realtime 리페치처럼 같은 값의 새 객체면 재계산 없음
  const advBefore = helperMemo.adv;
  mpRoom = JSON.parse(JSON.stringify(mpRoom));
  mpPlayers = JSON.parse(JSON.stringify(mpPlayers));
  renderMpGame();
  check('메모 유지(같은 값 → 같은 조언 객체)', helperMemo.adv === advBefore && line('#mp-helper-line').act === '3, 3 보관하고 다시 굴리기 · +10.5');
  // 3) OFF → 흐린 안내, 표시자 없음
  setHelper(false);
  L = line('#mp-helper-line');
  check('OFF 안내', !L.hidden && L.muted && L.act === '헬퍼 허용 방 · H 로 켜기', L.act);
  check('OFF 면 표시자 없음', document.querySelectorAll('#mp-dice .die.rec, #mp-cats .cat.rec').length === 0);
  // 4) H 키(멀티 핸들러) — 토글, 입력란 포커스 중엔 무시
  key('KeyH', 'h');
  check('멀티 H → ON', helperOn === true);
  const tmp = document.createElement('input');
  $('#mp-game').appendChild(tmp);
  tmp.focus();
  key('KeyH', 'h');
  check('입력란 포커스 중 H 무시', helperOn === true);
  tmp.remove();
  // 5) 표시 조건 — 상대 차례·비허용 방·굴리기 전
  mpRoom = { ...baseRoom, currentSeat: 1 }; renderMpGame();
  check('상대 차례 숨김', line('#mp-helper-line').hidden);
  mpRoom = { ...baseRoom, helperAllowed: false }; renderMpGame();
  check('비허용 방 숨김', line('#mp-helper-line').hidden);
  mpRoom = { ...baseRoom, rollsUsed: 0, dice: [] }; renderMpGame();
  check('굴리기 전 안내', line('#mp-helper-line').act === '주사위를 굴리면 최적의 수를 추천해 드려요.', line('#mp-helper-line').act);
  // 6) 레이아웃 — 내 차례 + 헬퍼 줄 + 매우 긴 원시 오류(3줄 제한), 두 테마
  mpRoom = { ...baseRoom }; renderMpGame();
  setGameMsg('upstream connect error or disconnect/reset before headers. retried and the latest reset reason: connection termination. '.repeat(4));
  for (const theme of ['dark', 'light']) {
    document.documentElement.dataset.theme = theme;
    check(`멀티 레이아웃 ${theme}: 스크롤 없음`, fits() && !line('#mp-helper-line').hidden, sizeOf());
  }
  document.documentElement.dataset.theme = 'dark';
  setGameMsg('');
  // 7) 대기실 규칙 줄(모든 방에 헬퍼 허용 여부)
  showScreen('mp-lobby');
  mpRoom = { ...baseRoom, status: 'lobby' }; renderLobby();
  check('대기실: 기본 룰 · 헬퍼 허용', $('#mp-rule-line').textContent === '기본 룰 · 헬퍼 허용', $('#mp-rule-line').textContent);
  mpRoom = { ...baseRoom, status: 'lobby', helperAllowed: false }; renderLobby();
  check('대기실: 기본 룰 · 헬퍼 비허용', $('#mp-rule-line').textContent === '기본 룰 · 헬퍼 비허용', $('#mp-rule-line').textContent);
  mpRoom = { ...baseRoom, status: 'lobby', helperAllowed: false, rulePreset: 'additional' }; renderLobby();
  check('대기실: 추가 룰 · 헬퍼 비허용', $('#mp-rule-line').textContent === '추가 룰 · 헬퍼 비허용', $('#mp-rule-line').textContent);
  // 8) 방 만들기 칩 + create_room 파라미터(네트워크 없이 함수 스텁)
  mpRoom = null; renderLobby();
  const chip = $('#mp-helper-toggle');
  check('칩 기본: 헬퍼 비허용', chip.textContent === '헬퍼 비허용' && !chip.disabled, chip.textContent);
  chip.click();
  check('칩 클릭: 헬퍼 허용', chip.textContent === '헬퍼 허용' && mpCreateHelper === true, chip.textContent);
  $('#mp-rule-toggle').click(); // → 추가 룰
  check('추가 룰: 칩 비활성·비허용', chip.disabled && chip.textContent === '헬퍼 비허용 (추가 룰)' && mpCreateHelper === false, chip.textContent);
  $('#mp-rule-toggle').click(); // → 기본 룰
  check('기본 룰 복귀: 칩 활성·비허용', !chip.disabled && chip.textContent === '헬퍼 비허용', chip.textContent);
  const saved = { ensureAnon, rpc, enterRoom };
  let call = null;
  ensureAnon = async () => 'u-me';
  rpc = async (name, p) => { call = { name, p }; return { room_id: 'r9', code: 'ZZZ999' }; };
  enterRoom = async () => {};
  $('#mp-name').value = '테스터';
  chip.click(); // 허용
  await mpCreate();
  check('create_room: 허용 전달', !!call && call.name === 'create_room' && call.p.p_helper_allowed === true && call.p.p_rule_preset === 'default', JSON.stringify(call));
  $('#mp-rule-toggle').click(); // 추가 룰 → 칩 강제 비허용
  await mpCreate();
  check('create_room: 추가 룰은 false', !!call && call.p.p_helper_allowed === false && call.p.p_rule_preset === 'additional', JSON.stringify(call));
  $('#mp-rule-toggle').click(); // 기본 룰로 원복
  ensureAnon = saved.ensureAnon; rpc = saved.rpc; enterRoom = saved.enterRoom;
  try { localStorage.removeItem('yd_mp_code'); } catch (_) {}
  // 9) 게임오버 — 허용 방은 등록 차단 + 2차 방어, 비허용 방은 정상
  mpRoom = { ...baseRoom, status: 'finished', winnerSeat: 0 };
  showScreen('mp-over'); initMpOver(); renderMpOver();
  check('멀티 등록 UI 숨김', $('#mp-lb-name').style.display === 'none' && $('#mp-lb-submit').style.display === 'none');
  check('멀티 사유 문구', $('#mp-lb-msg').textContent === '헬퍼 허용 방 — 리더보드 등록 제외', $('#mp-lb-msg').textContent);
  const net = stubFetch('submit_score');
  $('#mp-lb-name').value = 'tester';
  await mpSubmitScore();
  check('mpSubmitScore 2차 방어(네트워크 호출 0)', net.calls === 0, net.calls);
  net.restore();
  mpRoom = { ...baseRoom, status: 'finished', winnerSeat: 0, helperAllowed: false };
  initMpOver();
  check('비허용 방: 등록 UI 노출', $('#mp-lb-name').style.display === '' && $('#mp-lb-submit').style.display === '' && $('#mp-lb-msg').textContent === '');

  // 정리 — 솔로로 복귀
  mpRoom = null; mpPlayers = []; mySeat = null; mpUserId = null;
  showScreen('solo');
  setHelper(false);
  return list;
};
```

- [ ] **Step 2: 실패 확인**

Run: `cd desktop && npm run test:helper`
Expected: FAIL — `[mp]` 단계에서 `#mp-helper-line`/`#mp-helper-toggle` 없음(`ERROR TypeError … null`) 또는 대기실·게이트 ✗.

- [ ] **Step 3: popup.html — CSS(`#mp-game-msg` 3줄 제한)**

찾기: `      .helper-toggle.on { color: var(--emph); }`
바꾸기:
```css
      .helper-toggle.on { color: var(--emph); }
      /* 헬퍼 줄로 줄어든 멀티 세로 예산 보호 — 미매핑 원시 오류가 길어도 3줄까지만(전체 문구는 title) */
      #mp-game-msg { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
```

- [ ] **Step 4: popup.html — 마크업(멀티 헬퍼 줄, 방 만들기 칩)**

찾기:
```html
            <span class="mp-hint" title="상대 점수 보기"><span class="k">`</span> 상대</span>
          </div>
          <div class="lb-msg" id="mp-game-msg"></div>
```
바꾸기:
```html
            <span class="mp-hint" title="상대 점수 보기"><span class="k">`</span> 상대</span>
          </div>
          <div class="helper-line hidden" id="mp-helper-line"><span class="act"></span><span class="exp"></span></div>
          <div class="lb-msg" id="mp-game-msg"></div>
```
찾기: `          <button class="lb-btn rule-chip" id="mp-rule-toggle" title="방 규칙 전환" tabindex="-1">기본 룰</button>`
바꾸기:
```html
          <button class="lb-btn rule-chip" id="mp-rule-toggle" title="방 규칙 전환" tabindex="-1">기본 룰</button>
          <button class="lb-btn rule-chip" id="mp-helper-toggle" title="이 방에서 헬퍼 허용 — 방장 선택, 기본 룰만(허용 방은 리더보드 등록 제외)" tabindex="-1">헬퍼 비허용</button>
```

- [ ] **Step 5: popup.html — script 2 변경 7곳**

(1) 찾기: `      function setGameMsg(t) { const e = document.getElementById('mp-game-msg'); if (e) e.textContent = t || ''; }`
바꾸기:
```js
      // 3줄 넘으면 잘리므로(헬퍼 줄 공간) 전체 문구는 title 로.
      function setGameMsg(t) { const e = document.getElementById('mp-game-msg'); if (e) { e.textContent = t || ''; e.title = t || ''; } }
```
(2) 찾기: `        if (ruleLine) ruleLine.textContent = RULE_KO[mpRoom.rulePreset] + (mpRoom.rulePreset === 'additional' ? ' · 헬퍼 없음' : '');`
바꾸기: `        if (ruleLine) ruleLine.textContent = RULE_KO[mpRoom.rulePreset] + ' · 헬퍼 ' + (mpRoom.helperAllowed ? '허용' : '비허용'); // 웹 Lobby 와 동일`
(3) 찾기:
```js
        document.getElementById('mp-round').textContent = `${Math.min((room.round || 0) + 1, 12)} / 12`;
        if (mpSideOpen) renderSide();
      }
```
바꾸기:
```js
        document.getElementById('mp-round').textContent = `${Math.min((room.round || 0) + 1, 12)} / 12`;
        renderMpHelper(); // 헬퍼(#69) — 허용 방 · 내 차례에만
        if (mpSideOpen) renderSide();
      }

      // 헬퍼(#69) — '헬퍼 허용' 방 + 내 차례에서만. 테이블은 방 프리셋 기준(솔로 프리셋 아님 — 웹 잠복 버그 회피).
      // 멀티는 방 단위로 리더보드·평균이 이미 제외되므로 솔로 helperUsed 는 건드리지 않는다. 표시 전용(RPC 없음).
      function renderMpHelper() {
        const line = document.getElementById('mp-helper-line');
        const room = mpRoom;
        if (!line || !room) return;
        const myTurn = room.status === 'playing' && mySeat !== null && mySeat === room.currentSeat;
        if (!room.helperAllowed || !myTurn) { setHelperLine(line, null); return; }
        if (!helperOn) { setHelperLine(line, '헬퍼 허용 방 · H 로 켜기', '', true); return; }
        const preset = room.rulePreset === 'additional' ? 'additional' : 'default';
        helperLoad(preset);
        const dice = room.dice && room.dice.length === 5 ? room.dice : null;
        const rollsUsed = room.rollsUsed || 0;
        const rolled = !!dice && rollsUsed > 0;
        const adv = rolled ? helperAdvise(preset, { scores: mySc(), masterCells: myMaster() }, dice, 3 - rollsUsed) : null;
        if (!adv) { setHelperLine(line, helperIdleText(helperTables[preset].status, rolled), '', true); return; }
        const held = room.held && room.held.length === 5 ? room.held : [false, false, false, false, false];
        decorateAdvice(adv, dice, held, '#mp-dice .die', '#mp-cats .cat');
        setHelperLine(line, helperText(adv, dice), '예상 ' + Math.round(adv.expectedFinalScore));
      }
```
(4) 찾기:
```js
        if (msg) msg.textContent = '';
        if (btn) btn.disabled = false;
        mpLbSubmitted = false;
```
바꾸기:
```js
        // 헬퍼 허용 방은 방 단위로 리더보드 등록 제외(웹 MpGameOver 와 동일 — 실제로 헬퍼를 봤는지와 무관).
        const blocked = !!(mpRoom && mpRoom.helperAllowed);
        if (nm) nm.style.display = blocked ? 'none' : '';
        if (btn) { btn.style.display = blocked ? 'none' : ''; btn.disabled = false; }
        if (msg) msg.textContent = blocked ? '헬퍼 허용 방 — 리더보드 등록 제외' : '';
        mpLbSubmitted = false;
```
(5) 찾기:
```js
      async function mpSubmitScore() {
        if (mpLbSubmitted) return;
```
바꾸기:
```js
      async function mpSubmitScore() {
        if (mpLbSubmitted) return;
        if (mpRoom && mpRoom.helperAllowed) return; // 헬퍼 허용 방은 등록 제외 — UI 숨김 우회 대비 2차 방어
```
(6) 찾기: `      let mpCreatePreset = 'default'; // 방 만들기에서 고른 규칙(추가 룰은 헬퍼 없음 — 데스크톱은 어차피 헬퍼 미존재).`
바꾸기:
```js
      let mpCreatePreset = 'default'; // 방 만들기에서 고른 규칙.
      // 방 만들기: 헬퍼 허용(방장 선택, 기본 OFF — 웹 Home 과 동일). 추가 룰 방은 서버가 강제로 비허용하므로 칩도 비활성.
      let mpCreateHelper = false;
      function syncMpHelperChip() {
        const b = document.getElementById('mp-helper-toggle');
        if (!b) return;
        const ok = mpCreatePreset === 'default';
        if (!ok) mpCreateHelper = false;
        b.disabled = !ok;
        b.textContent = ok ? (mpCreateHelper ? '헬퍼 허용' : '헬퍼 비허용') : '헬퍼 비허용 (추가 룰)';
      }
```
찾기: `            p_display_name: name, p_helper_allowed: false, p_max_players: 4, p_rule_preset: mpCreatePreset,`
바꾸기: `            p_display_name: name, p_helper_allowed: mpCreateHelper && mpCreatePreset === 'default', p_max_players: 4, p_rule_preset: mpCreatePreset,`
(7) 찾기:
```js
      document.getElementById('mp-rule-toggle').onclick = (e) => {
        mpCreatePreset = mpCreatePreset === 'default' ? 'additional' : 'default';
        e.currentTarget.textContent = RULE_KO[mpCreatePreset];
      };
```
바꾸기:
```js
      document.getElementById('mp-rule-toggle').onclick = (e) => {
        mpCreatePreset = mpCreatePreset === 'default' ? 'additional' : 'default';
        e.currentTarget.textContent = RULE_KO[mpCreatePreset];
        syncMpHelperChip(); // 추가 룰이면 헬퍼 칩 비활성
      };
      document.getElementById('mp-helper-toggle').onclick = () => {
        if (mpCreatePreset !== 'default') return;
        mpCreateHelper = !mpCreateHelper;
        syncMpHelperChip();
      };
      syncMpHelperChip();
```
멀티 키 — 찾기:
```js
            setSideSeat(seats[idx]);
            return;
          }
          const room = mpRoom;
```
바꾸기:
```js
            setSideSeat(seats[idx]);
            return;
          }
          // 헬퍼 토글(H) — 턴과 무관한 선호 설정. 채팅·입력란 가드 뒤라 타이핑 중엔 발동하지 않는다.
          if (isHelperKey(e)) { e.preventDefault(); toggleHelper(); return; }
          const room = mpRoom;
```

- [ ] **Step 6: 통과 확인**

Run: `cd desktop && npm run test:helper`
Expected: solo + governance + mp 전부 ✓, 종료코드 0.

- [ ] **Step 7: Commit**

```bash
git add desktop/popup.html desktop/scripts/test-helper.page.js
git commit -m "feat(desktop): 멀티 헬퍼 허용 방 지원 + 허용 방 리더보드 등록 차단 (#69)"
```

---

## Task 5: 실제 main.js 스모크 프로브(dev·패키지) + 문서

**Files:**
- Modify: `desktop/main.js`(YD_SMOKE), `desktop/README.md`, `CLAUDE.md`

- [ ] **Step 1: main.js YD_SMOKE `helper` 프로브** — 찾기:
```js
        console.log('[yd] persist-test before:', before, '| afterEscHide destroyed:', destroyed, 'wasHidden:', !visible, '| after:', after);
```
바꾸기:
```js
        console.log('[yd] persist-test before:', before, '| afterEscHide destroyed:', destroyed, 'wasHidden:', !visible, '| after:', after);
        // 헬퍼(#69) — 실제 main.js 경로(dev: 저장소 public/, 설치본: resources/public)에서 테이블 로드·알려진 추천값 확인.
        const helperRaw = destroyed ? 'DESTROYED' : await js(`(async () => {
          const r = { engine: typeof YDEngine === 'object' };
          for (const p of ['default', 'additional']) { await helperLoad(p); r[p] = helperTables[p].status; }
          const efs = (p, card, dice, n) => { const a = helperTables[p].advisor; return a ? Math.round(a.advise(card, dice, n).expectedFinalScore * 100) / 100 : null; };
          r.defaultEfs = efs('default', { scores: {}, masterCells: [] }, [1, 2, 3, 4, 6], 2);
          r.additionalEfs = efs('additional', { scores: { yacht: 50, fourKind: 24 }, masterCells: ['sixes'] }, [2, 3, 4, 5, 5], 1);
          r.ok = r.engine && r.default === 'ready' && r.additional === 'ready' && r.defaultEfs === 188.93 && r.additionalEfs === 357.11;
          return JSON.stringify(r);
        })()`);
        let helperResult;
        try { helperResult = JSON.parse(helperRaw); } catch { helperResult = { ok: false, raw: String(helperRaw) }; }
        console.log('[yd] helper-test', JSON.stringify(helperResult));
```
찾기: `          const out = { opacity: opResult, drag: dragResult, persist: { before, destroyed, wasHidden: !visible, after } };`
바꾸기: `          const out = { opacity: opResult, drag: dragResult, persist: { before, destroyed, wasHidden: !visible, after }, helper: helperResult };`

- [ ] **Step 2: dev 실제 main.js 스모크** (팝업이 수 초간 떴다 사라짐 — 기존 하니스 특성)

Run(Git Bash, desktop/):
```bash
npm run build:engine
YD_SMOKE=1 YD_SMOKE_OUT="$(pwd)/smoke-result.json" ./node_modules/.bin/electron . --user-data-dir="$(mktemp -d)"
cat smoke-result.json && rm smoke-result.json
```
Expected: `"helper": { "engine": true, "default": "ready", "additional": "ready", "defaultEfs": 188.93, "additionalEfs": 357.11, "ok": true }`, 기존 `opacity`(`op45:45, saved45:45, opClamp:30`)·`drag`(전부 true)·`persist`(`destroyed:false, wasHidden:true`, after==before) 회귀 없음.

- [ ] **Step 3: 패키지 빌드** — `CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist -- --dir --publish never -c.win.signAndEditExecutable=false` 후 Task 1 Step 7 Windows assert 스크립트 통과.

- [ ] **Step 4: 패키지 exe 스모크(설치본 경로 resources/public)**

Run: `YD_SMOKE=1 YD_SMOKE_OUT="$(pwd)/smoke-pkg.json" "release/win-unpacked/Yacht Dice.exe" --user-data-dir="$(mktemp -d)"; cat smoke-pkg.json; rm smoke-pkg.json`
Expected: `"helper": { … "ok": true }` (YD_SMOKE 라 자동 업데이트 미동작).

- [ ] **Step 5: desktop/README.md**

- 도입부 두 번째 문단 끝 문장(`… 루트 웹 프로젝트(\`../dist\`)에는 의존하지 않습니다 — 루트 프로젝트와 완전히 분리(별도 \`package.json\`/\`node_modules\`)되어 영향을 주지 않습니다.`)을 다음으로 교체:
  `… 루트 웹 앱(\`../dist\`)에는 의존하지 않습니다(별도 \`package.json\`/\`node_modules\`). 단 **최적-EV 헬퍼**는 웹과 같은 엔진(\`../src/engine\`)을 빌드 때 \`vendor/yd-engine.js\` 로 번들하고 가치 테이블(\`../public/V*.bin\`)을 설치 파일에 동봉해 **오프라인으로** 동작합니다 — 런타임은 자립형, 빌드 때만 저장소의 엔진 소스·테이블을 읽습니다.`
- `## 개발 실행(설치 없이)` 코드 블록 → 
```bash
cd desktop
npm install
npm start            # 엔진 번들(build:engine) 후 electron . — 트레이 아이콘 표시(클릭 → 메뉴 → 플레이)
npm run test:helper  # 헬퍼 렌더러 테스트 — 숨은 창에서 실제 popup.html 검증(화면 표시 없음, 실패 시 종료코드 1)
```
  (아래에 한 줄: `> \`./node_modules/.bin/electron .\` 로 직접 띄울 땐 \`npm run build:engine\` 을 먼저 실행하세요(번들이 없으면 헬퍼만 오류 표시).`)
- `## 게임 (popup.html)` 문단의 `헬퍼·설정은 없지만(웹 버전에서 제공), **온라인 멀티플레이**와` → `웹과 같은 **최적-EV 헬퍼**(아래), **온라인 멀티플레이**와`
- 단축키 목록: `- **Space** — 주사위 굴리기` 다음에 `- **Backspace** — 직전 기록 되돌리기(턴 시작에서만, 리더보드 등록 제외)`, `Q W E R …` 줄 다음에 `- **H** — 헬퍼 켜기/끄기(한글 입력 상태에서도 동작)`
- `## 🌐 온라인 멀티플레이` 앞에 섹션 추가:
```markdown
## 🧭 헬퍼 (최적 EV)
웹과 **같은 엔진·같은 가치 테이블**로 매 굴림마다 최적의 수를 추천합니다(헤더 **H ◇/◆** 버튼 또는 **H** 키, 기본 꺼짐 · 켜짐 상태는 기억).

- 하단 한 줄 — `6, 6, 6 보관하고 다시 굴리기 · +12.0` / `지금 요트에 기록 · 50점` / `요트의 달인! 원 칸에 기록 · +100` + 우측 `예상 N`(최적 플레이 시 기대 최종 점수).
- 추천 보관 주사위엔 **밑줄**, 지금 기록할 칸엔 **진한 테두리**(무채색 — 창 크기 그대로).
- **공정성(웹과 동일)** — 조언이 한 번이라도 *표시된* 게임은 리더보드 등록과 개인 평균에서 제외됩니다(켜기만 하고 굴리기 전에 끄면 무관, 되돌리기로 풀리지 않음, 새 게임·룰 변경 시 초기화).
- **멀티** — 방장이 **헬퍼 허용**으로 만든 방(기본 룰만)에서 **내 차례**에만 표시됩니다(H 토글을 따름). 허용 방은 방 단위로 리더보드 등록이 제외됩니다.
```
- 멀티 섹션 `- **방 만들기** — 닉네임 입력 후 생성 → 6자리 **방 코드**가 표시됩니다.` → `- **방 만들기** — 닉네임 입력 후 생성 → 6자리 **방 코드**가 표시됩니다. **헬퍼 허용** 칩으로 방장이 헬퍼 허용 여부를 정합니다(기본 룰만, 기본 비허용 · 허용 방은 리더보드 등록 제외).`
- 리더보드 섹션 `- 게임 종료 화면의 … 등록합니다.` 줄 다음에 `- **헬퍼·되돌리기**를 쓴 솔로 게임과 **헬퍼 허용 방**의 멀티 게임은 등록할 수 없습니다(웹과 동일).`

- [ ] **Step 6: CLAUDE.md**

- `Desktop tray app (fully independent — its own \`package.json\`/\`node_modules\`, no link to the web build):` → `Desktop tray app (own \`package.json\`/\`node_modules\`; runtime is self-contained, but \`npm start\`/\`npm run dist\` bundle \`../src/engine\` into \`vendor/yd-engine.js\` via esbuild and ship \`../public/V*.bin\` through electron-builder \`extraResources\`):` 그리고 그 코드 블록에 `cd desktop && npm run test:helper           # helper renderer tests (hidden window, real popup.html)` 추가.
- `Tracks \`helperUsedThisGame\` (gates leaderboard eligibility — helper-assisted scores are flagged).` → `Tracks \`helperUsedThisGame\` (gates leaderboard eligibility — helper-assisted scores are blocked from submission client-side; \`submit_score\` has no helper field).`
- Invariants 목록 끝에 추가: `- The tray app ships the **committed** \`public/V*.bin\` (desktop CI doesn't regenerate them; \`desktop/scripts/build-engine.cjs\` only size/sanity-checks). After any rules/index change, regenerate **and commit** both tables, or the tray helper will be wrong but plausible. The tray re-implements the helper *gating* (\`helperUsed\`, helper-allowed rooms) inline in \`popup.html\` — keep it in sync with \`gameStore.ts\`/\`MpGameOver.tsx\`.`

- [ ] **Step 7: 루트 회귀 확인**

Run: `npm run typecheck && npm test` (저장소 루트)
Expected: 통과(루트 코드 변경 없음).

- [ ] **Step 8: Commit**

```bash
git add desktop/main.js desktop/README.md CLAUDE.md
git commit -m "test(desktop): YD_SMOKE 헬퍼 프로브 + 문서 갱신 (#69)"
```

---

## Self-Review

1. **스펙 커버리지** — 빌드·패키징(T1), 로더·어댑터·메모·문구·표시·토글·저장·H 키(T2), 솔로 거버넌스(T3), 멀티 표시·로비 줄·방 만들기·게임오버 게이트·메시지 3줄 제한(T4), 실제 main.js·패키지 경로·문서(T5). 비목표(서버·칸별 EV·PiP·웹 버그) 미포함 확인.
2. **플레이스홀더** — 없음(모든 코드·문구·기대값 명시, 기대값은 엔진 실측: 188.9306 / 225.3394 / 357.106 / 360.5238 / 166.7858, 보관 마스크 11110 · 01100 · 10111).
3. **타입/이름 일관성** — `helperLoad`·`helperTables`·`helperAdvise(preset, card, dice, rerollsLeft)`·`helperIdleText(status, rolled)`·`setHelperLine(el, text, exp, muted)`·`decorateAdvice(adv, dice, held, diceSel, catSel)`·`isHelperKey(e)`·`renderMpHelper()`·`mpCreateHelper`·`syncMpHelperChip()`·`disqualifyReason()` — T2~T5 와 테스트에서 동일 이름 사용.
4. **Review Focus** — IME(T2 9), 메모 유지(T4 2), 비정상 입력(T2 10), 로드 실패(T2 11), 패키지 경로(T5 4) 각각 테스트 배치.
