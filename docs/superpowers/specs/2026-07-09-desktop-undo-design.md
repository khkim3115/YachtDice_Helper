# 데스크톱 트레이 앱 솔로 되돌리기(Undo) 설계

- **이슈:** #62 — feat(desktop): 트레이 앱 솔로 되돌리기(Undo) — 웹과 동일 규칙
- **마일스톤:** #8 데스크톱 되돌리기(Undo) 지원
- **규모:** S (단일 파일 `desktop/popup.html`, 새 게임 로직 없음 — 웹 의미 이식)
- **날짜:** 2026-07-09
- **상태:** 설계 합의 완료(리더보드 실격·Backspace 단축키) → 구현 계획 단계로

## 1. 배경 / 결정 경위

웹 솔로에는 이미 되돌리기가 구현되어 있으나(`src/store/gameStore.ts`의 `history`/`SoloSnapshot`/`canUndo`/`undo`/`undoUsedThisGame`, UI는 `src/ui/DiceTray.tsx`의 `↩ 되돌리기` 버튼, 실격 게이트는 `src/ui/GameOver.tsx`), Electron 트레이 앱(`desktop/popup.html`)에는 없다. 트레이 앱은 멀티/솔로/리더보드를 자체 재구현한 독립 코드베이스이므로, 웹과 **동일한 의미**로 솔로 undo를 이식한다.

두 가지 사용자 결정:
- **리더보드: 실격(웹과 동일).** 웹·데스크톱이 같은 Supabase 리더보드를 공유하므로, undo 게임의 등록을 허용하면 데스크톱이 점수 부풀리기 우회로가 된다 → 공정성을 위해 실격 필수.
- **단축키: Backspace.** 데스크톱은 키보드 중심 UX(Space=굴리기, q/w/e…=카테고리)라 단일키가 자연스럽다. (웹에는 단축키 없음)

## 2. 목표 / 비목표

**목표**
- 데스크톱 솔로에 웹과 동일 의미의 되돌리기 추가: **직전 기록 1단계 취소, 턴 시작에서만, 주사위·굴림수까지 완전 복원.**
- 게임오버(12턴 기록) 결과 오버레이에서도 복원 가능.
- undo 사용 시 이번 게임 리더보드 등록 실격(웹 `undoUsedThisGame` 대응).
- `↩ 되돌리기` 버튼 + `Backspace` 단축키.

**비목표(웹과 동일하게 제외)**
- 멀티플레이어 undo (서버 권위 — Realtime/RPC라 불가·미노출).
- 다단계 되돌리기(여러 턴 롤백), 개별 굴림/홀드 단위 되돌리기.
- undo 이력 영속화(새로고침/재실행 넘어 유지) — 인메모리, `reset()`에서 초기화.

## 3. 접근

기존 `state` 게임 모델과 액션(`reset/roll/toggleHold/pick`)에 최소 침습으로 undo 스택을 얹는다. 웹 store가 `history`/`undoUsedThisGame`를 스냅샷 **밖**에 두는 구조를 그대로 따른다.

```
pick(cat)  ──기록 직전──▶ history.push(스냅샷)  ──▶ 채점·턴 진행
                                   │
Backspace / ↩버튼 ──undo()──▶ history.pop() → state 복원 + undoUsed=true + #over 숨김 + render
                                   │
canUndo = history.length>0 && !state.rolled   (턴 시작에서만)
reset() ──▶ history=[]; undoUsed=false
```

## 4. 상태 모델 (왜 스냅샷 밖인가)

`desktop/popup.html` 스크립트 최상위에 두 변수를 추가하고 `reset()`에서 초기화한다.

```js
let history = [];    // 되돌리기 스택(스냅샷 배열)
let undoUsed = false; // 이번 게임 undo 사용 여부(리더보드 실격 플래그)
```

- **`state` 안에 넣지 않는 이유:** 스냅샷은 `state`의 게임 필드 사본이다. `undoUsed`를 `state`에 넣으면 undo가 옛 스냅샷을 복원할 때 `undoUsed`가 다시 `false`로 되돌아가 실격이 풀려버린다. `history`를 `state`에 넣으면 스냅샷이 자기 자신을 포함해 무한 성장한다. 웹 store도 이 둘을 스냅샷 밖 최상위 필드로 두고 `newGame`에서만 리셋한다 — 동일 원칙.
- `reset()`은 이미 `state = { … }`를 새로 만든다. 여기에 `history = []; undoUsed = false;` 두 줄을 추가한다.

**스냅샷 형태(게임 상태 사본만):**
```js
{ dice:[...state.dice], held:[...state.held], rolls:state.rolls,
  rolled:state.rolled, filled:{...state.filled}, master:[...state.master], turn:state.turn }
```

## 5. 컴포넌트 / 변경 지점 (모두 `desktop/popup.html`)

| # | 위치(현재 라인 근사) | 변경 |
|---|---|---|
| A | 스크립트 최상위 / `reset()` (416–421) | `history`·`undoUsed` 선언 + `reset()`에서 초기화 |
| B | `pick(cat)` (441–457) | 채점 분기 **이전**에 스냅샷 push (달인·일반·12턴 종료 전 공통 경로) |
| C | 신규 `canUndo()` / `undo()` | `canUndo = history.length>0 && !state.rolled`; `undo()`는 pop→깊은복사 복원→`undoUsed=true`→`#over` 숨김→`render()` |
| D | 솔로 마크업 (238–246) | `#roll` 옆에 `<button id="undo">↩ 되돌리기</button>` 추가(솔로 화면 전용 → 멀티 자동 미노출) |
| E | `render()` (495–550) | `undoBtn.disabled = !canUndo()` 반영 |
| F | 버튼 배선 (552–559 부근) | `document.getElementById('undo').onclick = undo;` |
| G | 솔로 keydown (699–729) | `Backspace → undo()` (단, INPUT 포커스 중이면 무시) |
| H | `gameOver()` (476–490) | `undoUsed`면 `#lb-name`/`#lb-submit` 숨기고 `#lb-msg`="↩ 되돌리기 사용 — 리더보드 등록 제외"; 아니면 정상 노출(양방향 토글) |
| I | `submitScore()` (644–) | 상단에 `if (undoUsed) return;` 방어 가드 |

## 6. 데이터 흐름 / 동작 규칙

- **기록 → 되돌리기 가능:** `pick()`가 새 턴을 `rolled=false, rolls=3`로 시작 → `!state.rolled`이고 `history`가 있으니 `canUndo` 참. 버튼 활성.
- **굴리면 잠금:** 새 턴에서 `roll()` 한 번이라도 하면 `state.rolled=true` → `canUndo` 거짓. 그 턴의 되돌리기는 봉인.
- **1단계로 수렴:** 복원 스냅샷이 `rolled=true`(기록하려면 굴렸어야 함)를 되살리므로 undo 직후 `canUndo`는 거짓 → 연속 2회 자동 차단. 사실상 "직전 기록만" 취소.
- **게임오버 복원:** 12턴째 `pick()`도 채점 전 스냅샷을 push하고 `gameOver()`를 호출한다. `undo()`가 `#over`를 숨기고 그 턴 직전(주사위 보이던 상태)으로 복귀시킨다.
- **키보드 vs 버튼:** 버튼은 `canUndo`면 항상 동작. `Backspace`는 `#lb-name` 등 INPUT 포커스 중에는 텍스트 편집을 위해 undo를 발동하지 않는다(버튼으로 대체 가능).

## 7. 엣지 케이스 / 에러 처리

- `history` 비었을 때 `undo()` 즉시 return(무동작).
- 룰 프리셋 전환(`setSoloPreset`)은 `reset()`을 호출 → `history`/`undoUsed` 자동 초기화. 프리셋 경계 넘는 스냅샷 없음.
- `undoUsed` 실격은 **이번 게임 한정**. `reset()`(새로/다시/프리셋변경)으로 초기화되어 다음 게임엔 정상 등록 가능.
- 멀티 화면에는 `#undo` 버튼도 Backspace 경로도 없음(솔로 keydown 핸들러에만 추가) → 멀티 무영향.
- `submitScore()`의 `if (undoUsed) return;`는 UI 숨김이 우회돼도 서버 등록을 막는 2차 방어.

## 8. 검증 계획

메모리 [verify-electron-via-real-main] 원칙대로 `desktop/main.js`를 실제 구동해 팝업에서 확인(자체 드라이버 금지):

1. 기록(카테고리 선택) → `↩ 되돌리기` 활성 → 클릭/Backspace → 점수표·주사위·굴림수 복원.
2. 되돌린 뒤 굴리기 → 버튼 비활성(잠금) 확인.
3. 12턴 완주 → 결과창에서 되돌리기 → 게임 복귀.
4. undo 사용 게임의 게임오버 → 리더보드 등록 UI 숨김 + 안내문. (`submitScore` 가드도 확인)
5. 멀티 게임 화면 → undo 버튼/단축키 미노출·무동작.
6. `#lb-name` 포커스 상태에서 Backspace → 텍스트 편집만(undo 미발동).

## 9. 릴리스 메모(범위 밖 참고)

트레이 버전은 `desktop/package.json`에서 독립 관리(`tray-vX.Y.Z`). 배포·changelog 반영은 이 스펙 범위가 아니며, 별도 판단으로 진행한다.
