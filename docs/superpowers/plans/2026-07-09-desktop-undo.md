# 데스크톱 솔로 되돌리기(Undo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Electron 트레이 앱(`desktop/popup.html`) 솔로 모드에 웹과 동일한 의미의 되돌리기(직전 기록 1단계 취소·주사위/굴림수 복원·리더보드 실격)를 추가한다.

**Architecture:** 기존 `state` 게임 모델과 액션(`reset/roll/toggleHold/pick`)에 최소 침습으로 undo 스택을 얹는다. 스냅샷 스택(`history`)과 실격 플래그(`undoUsed`)는 `state` **밖** 전역에 두어 복원이 이 둘을 오염시키지 않게 한다(웹 `src/store/gameStore.ts`와 동일 원칙). 멀티는 서버 권위라 미포함.

**Tech Stack:** 순수 인라인 JS + DOM(빌드/프레임워크 없음). 단일 파일 `desktop/popup.html`.

## Global Constraints

- 모든 변경은 **단일 파일 `desktop/popup.html`** 안에서만. 새 파일·의존성 없음.
- `history`·`undoUsed`는 반드시 `state` **밖** 전역. `reset()`에서 초기화. 스냅샷에 이 둘을 포함하지 않는다.
- `canUndo()` 정의는 정확히 `history.length > 0 && !state.rolled` (웹 `rollsUsed === 0` 대응 = 턴 시작).
- 스냅샷 형태(게임상태 사본만): `{ dice, held, rolls, rolled, filled, master, turn }` — 배열/객체는 얕은 복사본으로.
- 단축키는 **Backspace**. `#lb-name` 등 INPUT 포커스 중에는 발동 금지(텍스트 편집 보호).
- undo 사용 게임은 **리더보드 등록 실격**: 게임오버에서 등록 UI 숨김 + `submitScore()` 진입 가드.
- 멀티(솔로 keydown 핸들러는 `#mp` 가시 시 즉시 return; 멀티 마크업엔 undo 요소 없음)에는 영향 없음.
- 범위 밖(웹과 동일하게 제외): 다단계 undo, 개별 굴림 undo, 영속화, 멀티 undo, changelog/버전 범프.
- 코드 주석은 한국어(코드베이스 관례).

---

## File Structure

| 파일 | 책임 | 이 계획에서의 변경 |
|---|---|---|
| `desktop/popup.html` | 트레이 팝업 UI + 솔로/멀티 게임 로직(자체 구현) | undo 상태·로직·버튼·단축키·리더보드 실격 추가(솔로 스크립트/솔로 마크업/CSS만) |
| `.claude/launch.json` | preview 정적 서버 설정 | 검증용 `desktop-static` 서버 항목 추가(코드 변경 아님, 검증 하네스) |

`desktop/main.js`·`preload.js`·멀티 스크립트(둘째 `<script>`)는 **건드리지 않는다.**

## Verification Harness (모든 태스크 공통)

`popup.html`은 렌더러라 Electron/Supabase 없이 정적 서버 + preview로 검증한다(메모리 `verify-popup-html-static-preview` 관례). `window.yd`(preload)는 미주입 시 자동 폴백, `window.supabase`는 vendor 동봉이라 정적 로드로 충분(솔로 undo는 네트워크 불필요). 솔로 최상위 선언은 전역 렉시컬 스코프라 `preview_eval`로 `state`/`history`/`undoUsed`/`canUndo`/`pick`/`undo`/`roll`/`CATS` 참조 가능.

`.claude/launch.json`에 다음 서버가 없으면 추가(있으면 재사용):

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "desktop-static", "runtimeExecutable": "npx", "runtimeArgs": ["-y", "serve", "desktop", "-l", "5599"], "port": 5599 }
  ]
}
```

검증 시작: `preview_start`(name `desktop-static`) → `preview_eval: window.location.href='/popup.html'` (또는 `serve`의 디렉터리 인덱스에서 popup.html 로드) → 초기 화면은 솔로.

---

## Task 1: Undo 코어 (상태·스냅샷·canUndo·undo)

**Files:**
- Modify: `desktop/popup.html` — `reset()`(416–421), `pick()`(441–457), 그리고 `pick()` 직후(459행 앞) 신규 함수.

**Interfaces:**
- Produces: 전역 `history: Array<Snapshot>`, `undoUsed: boolean`, `canUndo(): boolean`, `undo(): void`. `Snapshot = { dice:number[], held:boolean[], rolls:number, rolled:boolean, filled:Record<string,number>, master:string[], turn:number }`. Task 2·3가 `canUndo`/`undo`/`undoUsed`를 사용.
- Consumes: 기존 전역 `state`, `render()`, `CATS`, `masterActive()`.

- [ ] **Step 1: 전역 변수 선언 + `reset()` 초기화**

`desktop/popup.html`에서 아래 old→new로 교체:

old:
```js
      let state;
      function reset() {
        state = { dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false], rolls: 3, rolled: false, filled: {}, master: [], turn: 0 };
        document.getElementById('over').classList.add('hidden');
        render();
      }
```
new:
```js
      let state;
      // 되돌리기 스택·실격 플래그는 state 밖에 둔다 — 스냅샷 복원이 이 둘을 되돌리면
      // undoUsed 실격이 풀리거나 history가 자기 자신을 포함해 무한 성장하기 때문(웹 store와 동일 원칙).
      let history = [];     // 기록 직전 게임상태 스냅샷 스택.
      let undoUsed = false; // 이번 게임에서 되돌리기를 한 번이라도 썼는지(리더보드 실격).
      function reset() {
        state = { dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false], rolls: 3, rolled: false, filled: {}, master: [], turn: 0 };
        history = [];
        undoUsed = false;
        document.getElementById('over').classList.add('hidden');
        render();
      }
```

- [ ] **Step 2: `pick()`에서 채점 직전 스냅샷 push**

old:
```js
      function pick(cat) {
        if (!state.rolled || state.filled[cat.id] != null || state.master.includes(cat.id)) return;
        if (masterActive()) {
```
new:
```js
      function pick(cat) {
        if (!state.rolled || state.filled[cat.id] != null || state.master.includes(cat.id)) return;
        // 채점 직전 상태를 되돌리기 스택에 저장(사본). 12턴 종료 직전에도 저장 → 게임오버에서도 복원 가능.
        history.push({
          dice: [...state.dice], held: [...state.held], rolls: state.rolls, rolled: state.rolled,
          filled: { ...state.filled }, master: [...state.master], turn: state.turn,
        });
        if (masterActive()) {
```

- [ ] **Step 3: `canUndo()`·`undo()` 함수 추가(`pick()` 닫는 `}` 다음 줄, `upperSub()` 앞)**

`pick()` 끝(457행 `}`) 바로 다음, 459행 `// 보너스 칸은 상단 소계에서 제외...` 앞에 삽입:
```js

      // 되돌리기 가능: 되돌릴 기록이 있고 이번 턴을 아직 안 굴렸을 때만(웹 rollsUsed===0 대응).
      function canUndo() { return history.length > 0 && !state.rolled; }
      function undo() {
        if (!history.length) return;
        const p = history.pop();
        state.dice = [...p.dice];
        state.held = [...p.held];
        state.rolls = p.rolls;
        state.rolled = p.rolled;
        state.filled = { ...p.filled };
        state.master = [...p.master];
        state.turn = p.turn;
        undoUsed = true; // 이번 게임 리더보드 실격.
        document.getElementById('over').classList.add('hidden'); // 게임오버에서 되돌리면 게임 복귀.
        render();
      }
```

- [ ] **Step 4: 정적 서버 기동 후 코어 동작 검증(preview_eval)**

`.claude/launch.json`에 `desktop-static` 없으면 추가 → `preview_start`(`desktop-static`) → popup.html 로드.

`preview_eval` 로 시나리오 실행 후 어서션:
```js
(() => {
  reset();
  roll();                       // rolled=true, rolls=2
  const beforeTurn = state.turn; // 0
  pick(CATS[0]);                // 기록 → turn=1, 새 턴 시작(rolled=false)
  const afterPick = { turn: state.turn, hist: history.length, canUndo: canUndo(), filled0: state.filled[CATS[0].id] };
  undo();                       // 복원
  const afterUndo = { turn: state.turn, hist: history.length, undoUsed, canUndo: canUndo(), filled0: state.filled[CATS[0].id] };
  return { beforeTurn, afterPick, afterUndo };
})()
```
Expected:
- `afterPick`: `{ turn:1, hist:1, canUndo:true, filled0:<숫자> }` (기록 직후 새 턴이라 되돌리기 가능).
- `afterUndo`: `{ turn:0, hist:0, undoUsed:true, canUndo:false, filled0:undefined }` — 턴·점수 복원, 스택 비움, 실격 플래그 셋, 복원된 `rolled=true`라 연속 undo 자동 차단.

- [ ] **Step 5: 빈 스택 무동작 + 게임오버 복원 검증(preview_eval)**

```js
(() => {
  reset();
  undo();                                   // 빈 스택 → 무동작
  const empty = { turn: state.turn, hist: history.length, undoUsed };
  // 12턴 완주(빠르게): 각 턴 roll 후 남은 첫 빈 칸 기록
  for (let t = 0; t < 12; t++) {
    roll();
    const c = CATS.find((c) => state.filled[c.id] == null && !state.master.includes(c.id));
    pick(c);
  }
  const overShown = !document.getElementById('over').classList.contains('hidden');
  undo();                                   // 게임오버에서 되돌리기
  const afterUndo = { over: !document.getElementById('over').classList.contains('hidden'), turn: state.turn };
  return { empty, overShown, afterUndo };
})()
```
Expected: `empty` = `{turn:0,hist:0,undoUsed:false}`; `overShown` = `true`; `afterUndo` = `{ over:false, turn:11 }` (오버레이 숨김·게임 복귀).

- [ ] **Step 6: Commit**

```bash
git add desktop/popup.html .claude/launch.json
git commit -m "feat(desktop): 솔로 되돌리기 코어 — 스냅샷 스택·canUndo·undo (#62)"
```

---

## Task 2: UI 어포던스 (버튼·CSS·render 반영·단축키)

**Files:**
- Modify: `desktop/popup.html` — CSS(`.roll:disabled` 다음, 107행 뒤), 솔로 마크업(239행 `#roll`), `render()`(506–508 부근), 버튼 배선(552–559 부근), 솔로 keydown(699–723).

**Interfaces:**
- Consumes: Task 1의 `canUndo()`, `undo()`.
- Produces: DOM `#undo` 버튼(솔로 전용), Backspace 단축키 경로.

- [ ] **Step 1: `.roll-row`·`.undo` CSS 추가(107행 `.roll:disabled {...}` 다음 줄)**

old:
```css
      .roll:disabled { opacity: 0.45; cursor: default; }
```
new:
```css
      .roll:disabled { opacity: 0.45; cursor: default; }
      .roll-row { display: flex; gap: 5px; }
      .roll-row .roll { flex: 1; }
      .undo { border: 1px solid var(--line); background: var(--panel2); color: var(--mut); border-radius: 5px; padding: 0 10px; cursor: pointer; font-size: 11px; white-space: nowrap; }
      .undo:hover:not(:disabled) { color: var(--txt); background: var(--panel3); }
      .undo:disabled { opacity: 0.4; cursor: default; }
```

- [ ] **Step 2: `#roll`을 `.roll-row`로 감싸고 `#undo` 추가**

old:
```html
      <button class="roll" id="roll" tabindex="-1">굴리기</button>
```
new:
```html
      <div class="roll-row">
        <button class="roll" id="roll" tabindex="-1">굴리기</button>
        <button class="undo" id="undo" tabindex="-1" disabled title="마지막 기록 되돌리기 (Backspace)">↩ 되돌리기</button>
      </div>
```

- [ ] **Step 3: `render()`에서 `#undo` 활성 상태 반영**

`render()` 안 roll 버튼 처리(506–508):
old:
```js
        const rollBtn = document.getElementById('roll');
        rollBtn.innerHTML = state.rolls > 0 ? `굴리기 (${state.rolls}) <span class="k">Space</span>` : '기록';
        rollBtn.disabled = state.rolls <= 0;
```
new:
```js
        const rollBtn = document.getElementById('roll');
        rollBtn.innerHTML = state.rolls > 0 ? `굴리기 (${state.rolls}) <span class="k">Space</span>` : '기록';
        rollBtn.disabled = state.rolls <= 0;
        const undoBtn = document.getElementById('undo');
        if (undoBtn) undoBtn.disabled = !canUndo();
```

- [ ] **Step 4: `#undo` 클릭 배선**

기존 배선부(552–559)에서 `document.getElementById('new').onclick = reset;` 있는 근처에 한 줄 추가:
old:
```js
      document.getElementById('roll').onclick = roll;
      document.getElementById('new').onclick = reset;
```
new:
```js
      document.getElementById('roll').onclick = roll;
      document.getElementById('undo').onclick = undo;
      document.getElementById('new').onclick = reset;
```

- [ ] **Step 5: 솔로 keydown에 Backspace→undo 추가(INPUT 포커스 보호)**

솔로 keydown 핸들러의 Escape 처리(707행) 다음, `overOpen` 블록(708행) **앞**에 삽입:

old:
```js
        if (e.key === 'Escape') { e.preventDefault(); hidePopup(); return; }
        const overOpen = !document.getElementById('over').classList.contains('hidden');
```
new:
```js
        if (e.key === 'Escape') { e.preventDefault(); hidePopup(); return; }
        // 되돌리기(Backspace) — 닉네임 입력 포커스 중엔 텍스트 편집을 위해 무시. 게임오버에서도 동작.
        if (e.key === 'Backspace' && canUndo() && document.activeElement !== nameInput) {
          e.preventDefault(); undo(); return;
        }
        const overOpen = !document.getElementById('over').classList.contains('hidden');
```
(주의: `nameInput`은 634행에서 이미 선언된 전역 `const nameInput = document.getElementById('lb-name')` 재사용.)

- [ ] **Step 6: 버튼·단축키·비활성 검증(preview)**

`preview_start` 재사용 → popup.html 리로드(`preview_eval: location.reload()`).

1) 초기(리셋 직후) `#undo` 비활성:
`preview_inspect` selector `#undo` → `disabled` 속성 존재 확인. 또는 `preview_eval: document.getElementById('undo').disabled` → `true`.

2) 기록 후 활성 → 클릭 복원:
```js
preview_eval: (() => { reset(); roll(); pick(CATS[0]); return document.getElementById('undo').disabled; })()
```
→ `false`. 이어 `preview_click` selector `#undo` → `preview_eval: ({turn: state.turn, undoUsed})` → `{turn:0, undoUsed:true}`.

3) 굴린 뒤 비활성(잠금):
```js
preview_eval: (() => { reset(); roll(); pick(CATS[0]); roll(); return document.getElementById('undo').disabled; })()
```
→ `true` (새 턴에서 굴렸으므로).

4) Backspace 단축키:
```js
preview_eval: (() => { reset(); roll(); pick(CATS[0]); return {before: state.turn}; })()
```
→ `{before:1}`. 이어 Backspace keydown 디스패치:
```js
preview_eval: document.dispatchEvent(new KeyboardEvent('keydown', {key:'Backspace', bubbles:true, cancelable:true})); ({turn: state.turn, undoUsed})
```
→ `{turn:0, undoUsed:true}`.

5) 멀티 미노출 확인: `preview_eval: !!document.querySelector('#mp #undo, #mp-game #undo')` → `false` (멀티 컨테이너 안에 undo 요소 없음).

- [ ] **Step 7: Commit**

```bash
git add desktop/popup.html
git commit -m "feat(desktop): 되돌리기 버튼·Backspace 단축키·render 반영 (#62)"
```

---

## Task 3: 리더보드 실격 (게임오버 게이트 + submitScore 가드)

**Files:**
- Modify: `desktop/popup.html` — `gameOver()`(476–490), `submitScore()`(644–646).

**Interfaces:**
- Consumes: Task 1의 `undoUsed`.
- Produces: 없음(동작 게이트).

- [ ] **Step 1: `gameOver()`에서 undo 사용 시 등록 UI 숨김**

old:
```js
        // 리더보드 등록 UI 초기화(데스크톱은 헬퍼가 없어 항상 등록 가능).
        const msg = document.getElementById('lb-msg');
        const btn = document.getElementById('lb-submit');
        const nm = document.getElementById('lb-name');
        if (msg) msg.textContent = '';
        if (btn) btn.disabled = false;
        lbSubmitted = false; // 새 게임 점수 → 다시 등록 가능.
        try { if (nm) nm.value = localStorage.getItem('yd_lb_name') || ''; } catch {}
```
new:
```js
        // 리더보드 등록 UI 초기화. 단, 되돌리기를 쓴 게임은 등록 실격(웹 undoUsedThisGame 대응).
        const msg = document.getElementById('lb-msg');
        const btn = document.getElementById('lb-submit');
        const nm = document.getElementById('lb-name');
        lbSubmitted = false; // 새 게임 점수 → 다시 등록 가능.
        if (undoUsed) {
          if (nm) nm.style.display = 'none';
          if (btn) btn.style.display = 'none';
          if (msg) msg.textContent = '↩ 되돌리기 사용 — 리더보드 등록 제외';
        } else {
          if (nm) nm.style.display = '';
          if (btn) { btn.style.display = ''; btn.disabled = false; }
          if (msg) msg.textContent = '';
          try { if (nm) nm.value = localStorage.getItem('yd_lb_name') || ''; } catch {}
        }
```

- [ ] **Step 2: `submitScore()` 진입 가드(2차 방어)**

old:
```js
      async function submitScore() {
        // 이미 등록했거나 진행 중이면 무시(버튼 클릭·Enter 연타 모두 차단).
        if (lbSubmitted) return;
```
new:
```js
      async function submitScore() {
        // 되돌리기를 쓴 게임은 등록 실격 — UI 숨김이 우회돼도 서버 등록 차단(2차 방어).
        if (undoUsed) return;
        // 이미 등록했거나 진행 중이면 무시(버튼 클릭·Enter 연타 모두 차단).
        if (lbSubmitted) return;
```

- [ ] **Step 3: 실격 게이트 검증(preview)**

리로드 후:

1) undo 사용 게임의 게임오버 → 등록 UI 숨김 + 안내:
```js
preview_eval: (() => {
  reset();
  for (let t = 0; t < 12; t++) { roll(); const c = CATS.find((c)=>state.filled[c.id]==null && !state.master.includes(c.id)); pick(c); }
  undo();               // 되돌리기 사용(undoUsed=true), 게임오버 숨김
  // 마지막 턴 다시 기록해 게임오버 재진입
  roll(); const c2 = CATS.find((c)=>state.filled[c.id]==null && !state.master.includes(c.id)); pick(c2);
  return {
    over: !document.getElementById('over').classList.contains('hidden'),
    nameHidden: getComputedStyle(document.getElementById('lb-name')).display === 'none',
    btnHidden: getComputedStyle(document.getElementById('lb-submit')).display === 'none',
    msg: document.getElementById('lb-msg').textContent,
  };
})()
```
Expected: `{ over:true, nameHidden:true, btnHidden:true, msg:'↩ 되돌리기 사용 — 리더보드 등록 제외' }`.

2) `submitScore()` 가드: 위 상태에서
```js
preview_eval: (async () => { const before = document.getElementById('lb-msg').textContent; await submitScore(); return { before, after: document.getElementById('lb-msg').textContent }; })()
```
Expected: `before === after`(=실격 안내 그대로) — `등록 중…`으로 바뀌지 않음(가드로 조기 return).

3) 새 게임이면 실격 해제:
```js
preview_eval: (() => {
  reset(); // undoUsed=false
  for (let t = 0; t < 12; t++) { roll(); const c = CATS.find((c)=>state.filled[c.id]==null && !state.master.includes(c.id)); pick(c); }
  return {
    nameShown: getComputedStyle(document.getElementById('lb-name')).display !== 'none',
    btnShown: getComputedStyle(document.getElementById('lb-submit')).display !== 'none',
    msg: document.getElementById('lb-msg').textContent,
  };
})()
```
Expected: `{ nameShown:true, btnShown:true, msg:'' }` — undo 없이 완주하면 정상 등록 UI.

- [ ] **Step 4: Commit**

```bash
git add desktop/popup.html
git commit -m "feat(desktop): 되돌리기 사용 시 리더보드 등록 실격 (#62)"
```

---

## Task 4: 통합 검증 (스펙 §8 시나리오 완주)

**Files:** 없음(검증 전용). 문제 발견 시 해당 Task로 돌아가 수정.

- [ ] **Step 1: 스펙 6개 시나리오를 정적 preview로 순차 확인**

메모리 `verify-popup-html-static-preview` 관례대로 `desktop-static` preview에서 UI를 실제로 구동(클릭/키보드)하며 확인. 각 항목 preview_screenshot/preview_inspect로 근거 남김:

1. 기록 → `↩ 되돌리기` 활성 → 클릭/Backspace → 점수표·주사위·굴림수 복원.
2. 되돌린 뒤 굴리기 → 버튼 비활성.
3. 12턴 완주 → 결과창에서 되돌리기 → 게임 복귀.
4. undo 게임 게임오버 → 등록 UI 숨김 + 안내(+ `submitScore` 가드).
5. 멀티 화면(방 만들기/모의 진입) → undo 버튼·Backspace 미노출·무동작. (멀티는 서버 필요 → 최소한 `#mp` 표시 상태에서 Backspace가 솔로 undo를 호출하지 않음을 `preview_eval`로 확인: `#mp` 언하이드 후 Backspace 디스패치 시 `undoUsed` 불변.)
6. `#lb-name` 포커스 상태에서 Backspace → 텍스트 편집만(undo 미발동): 포커스 후 값 입력→Backspace→값 1글자 삭제 & `undoUsed` 불변.

- [ ] **Step 2: 회귀 스모크**

기존 솔로 흐름(굴리기 Space·홀드 숫자키·카테고리 q/w/e…·↺ 새로·규칙 전환)이 그대로 동작하는지 클릭/키보드로 확인. 특히 규칙 전환 후 `history`/`undoUsed` 초기화 확인.

- [ ] **Step 3: (선택) 실제 Electron 스모크**

가능하면 `cd desktop && npm start`로 실제 트레이 팝업에서 기록→되돌리기 육안 확인(정적 preview가 못 잡는 preload/트레이 상호작용 안심용). 헤드리스 제약 시 정적 preview 근거로 갈음.

- [ ] **Step 4: 검증 결과를 이슈 #62에 코멘트로 기록**

`gh issue comment 62`로 통과/실패 요약과 스크린샷 근거 남김.

---

## Self-Review

**1. Spec coverage:**
- §4 상태 모델(state 밖 history/undoUsed) → Task 1 Step 1. ✓
- §5 변경 지점 A–I → A(T1S1), B(T1S2), C(T1S3), D(T2S2), E(T2S3), F(T2S4), G(T2S5), H(T3S1), I(T3S2). 전부 매핑됨. ✓
- §6 동작 규칙(1단계 수렴·게임오버 복원) → T1 Step 4·5 검증. ✓
- §7 엣지(빈 스택/프리셋 초기화/멀티 무영향/2차 방어/INPUT 보호) → T1S5, T2S5, T3S2, T4S1(5·6). ✓
- §8 검증 6항목 → Task 4. ✓

**2. Placeholder scan:** "적절한 에러 처리" 류 없음. 모든 코드 스텝에 실제 코드·정확 경로·기대 출력 명시. ✓

**3. Type consistency:** `canUndo()`/`undo()`/`undoUsed`/`history` 이름이 T1 정의 ↔ T2·T3 사용에서 동일. 스냅샷 필드(`dice/held/rolls/rolled/filled/master/turn`)가 push(T1S2)와 restore(T1S3)에서 일치. `nameInput`(634행)·`#lb-name`/`#lb-submit`/`#lb-msg`·`#mp`·`#over` 셀렉터 실제 존재 확인됨. ✓
