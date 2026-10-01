# 데스크톱 트레이 앱 최적-EV 헬퍼 설계

- **이슈:** #69 — feat(desktop): 트레이 앱 최적-EV 헬퍼 — 솔로 + 멀티(헬퍼 허용 방), 웹과 동일 규칙
- **마일스톤:** #10 데스크톱 헬퍼 지원
- **규모:** M (빌드 스크립트 1 + 렌더러 테스트 하네스 + `desktop/popup.html` 솔로·멀티 + `main.js` 스모크 프로브 + CI/문서)
- **날짜:** 2026-10-01
- **상태:** 설계 합의 완료(범위·UI 양·멀티 표시·토글 저장 4개 결정) → 구현 계획 단계로

## 1. 배경 / 결정 경위

웹에는 최적-EV 헬퍼(`src/engine/advisor.ts`의 `createAdvisor(V, rules).advise(card, dice, rerollsLeft)` + 사전계산 가치테이블 `public/V.bin`·`public/V.additional.bin`)가 있지만, Electron 트레이 앱(`desktop/popup.html`)에는 없다. 최초 데스크톱(cf2d37f)은 웹 전체를 V.bin째 감쌌으나 42분 뒤(9953740) 초소형 자립 팝업으로 피벗하며 "멀티/헬퍼/설정 없음"으로 잘렸다 — **정책이 아닌 폼팩터 컷**. 멀티는 #6(PR #13)에서 바닐라 이식으로 복귀했고, 헬퍼도 복귀시킨다.

사용자 결정(브레인스토밍):

| 항목 | 결정 |
|---|---|
| 범위 | 솔로(기본·추가 룰) + 멀티 전체 — 헬퍼 허용 방 내 차례 표시 + 트레이 방장도 '헬퍼 허용' 방 생성(기본 룰만) |
| UI 양 | 하단 한 줄 요약 + 추천 보관 주사위 밑줄 + 지금 기록할 칸 테두리 + `예상 N`. 창 크기 불변·무채색 |
| 멀티 표시 | 허용 방 내 차례에 H 토글을 따름. OFF 면 흐린 안내 `헬퍼 허용 방 · H 로 켜기` |
| 토글 저장 | localStorage `yd_helper`(`'1'`/`'0'`), 첫 실행 OFF |

아키텍처 결정: **웹 엔진을 빌드 타임에 번들**(손 이식 기각). DP·테이블 인덱싱은 저장소에서 가장 강한 불변식(CATEGORY_IDS 비트 순서·packState)이라 손 이식은 "그럴듯하지만 틀린" 추천 위험이 크고 popup.html 엔 테스트가 없다. 결과적으로 문서화된 원칙 "desktop 완전 독립(공유 코드 없음)"을 **"런타임 독립, 빌드 타임에 엔진·테이블만 공유"**로 개정한다. 트레이 채점 코드는 계속 자체 사본.

## 2. 목표 / 비목표

**목표**
- 트레이 솔로·멀티(헬퍼 허용 방)에 웹과 **같은 엔진·같은 추천**을 표시.
- 웹과 **같은 공정성 규칙**: 조언이 실제 표시된 솔로 게임은 리더보드 등록 차단·평균 미집계, 멀티 허용 방은 방 단위 등록 차단.
- 기존 공백 수정: 트레이가 헬퍼 허용 방의 멀티 점수를 리더보드에 등록할 수 있던 문제.
- 오프라인·자립 런타임 유지(엔진 번들·테이블을 설치 파일에 동봉).

**비목표**
- 서버 변경(`submit_score` 헬퍼 필드, 추가 룰 방 헬퍼 허용 정책).
- 칸별 기대점수·콤보 확률·창 크기 확대, 추천 자동 적용.
- PiP 미니 모드 헬퍼, 웹 `MultiplayerGame` 프리셋 테이블 잠복 버그(별도 이슈).
- 구버전 트레이 클라이언트 강제(서버 검증 불가).

## 3. 접근

```
빌드 타임(desktop/):  npm start / npm run dist
  └ prestart·predist → scripts/build-engine.cjs
       ├ ../public/V.bin(1,048,576 B)·V.additional.bin(4,194,304 B) 크기 검증
       ├ esbuild: ../src 의 createAdvisor·룰·상태수 → vendor/yd-engine.js (IIFE, 전역 YDEngine)
       └ 자체 점검: vm 에서 번들 실행 → 알려진 추천값 재현(188.93 / 357.11) 실패 시 빌드 중단
패키지:  app.asar ← vendor/yd-engine.js (files)   resources/public ← V*.bin (extraResources)
런타임(popup.html):  <script src="./vendor/yd-engine.js">
  helperLoad(preset) ─ fetch('../public/V*.bin') → 길이·sanity 검증 → createAdvisor → 워밍업
  render() ─ renderHelper() ─ 어댑터(트레이 상태→엔진 카드) → 메모된 advise → 요약 줄·표시
                                └ 조언 표시 순간 helperUsed = true (리더보드·평균 게이트)
  renderMpGame() ─ renderMpHelper() (허용 방·내 차례·방 프리셋 테이블)
```

`../public/...` URL 은 dev(`desktop/popup.html` → 저장소 `public/`)와 패키지(`resources/app.asar/popup.html` → `resources/public/`)에서 **동일하게** 해석된다(실측).

## 4. 상태 모델

`desktop/popup.html` script 1 최상위:

```js
let helperOn;          // 헬퍼 ON/OFF(localStorage yd_helper, 기본 OFF) — 솔로·멀티 공용 선호
let helperUsed = false; // 이번 솔로 게임에 조언이 표시됐는지(리더보드·평균 제외) — undoUsed 옆, state 밖
const helperTables = { default: {status, advisor, promise}, additional: {…} }; // 지연 로드 캐시
let helperMemo = { key, adv }; // 값 키(preset|card|dice|rerollsLeft) 메모
```

- `helperUsed` 를 `state` 밖에 두는 이유는 `undoUsed` 와 같다 — 되돌리기 스냅샷 복원이 실격을 풀면 안 된다. `reset()` 에서만 `false`.
- 멀티는 방 단위 게이트라 `helperUsed` 를 쓰지 않는다.

## 5. 컴포넌트 / 변경 지점

| 파일 | 변경 |
|---|---|
| `desktop/scripts/build-engine.cjs` (신규) | 테이블 크기 검증 + esbuild 번들 + 자체 점검 |
| `desktop/package.json` / `package-lock.json` | esbuild 0.28.2 devDep, `build:engine`·`prestart`·`predist`·`test:helper`, `files += vendor/yd-engine.js`, `extraResources += ../public V*.bin`, description |
| `desktop/.gitignore` | `vendor/yd-engine.js` |
| `desktop/popup.html` | CSS(무채색), 엔진 스크립트 태그, 헤더 `H ◇/◆` 버튼, `#helper-line`·`#mp-helper-line`, 헬퍼 모듈(로더·어댑터·메모·문구·표시·토글·H 키), render 훅, 솔로 게이트(리더보드·평균·사유), 멀티(표시·로비 줄·방 만들기 칩·게임오버 게이트·`#mp-game-msg` 3줄 제한) |
| `desktop/scripts/test-helper.cjs` · `test-helper.page.js` (신규) | 숨은 창(트레이와 같은 webPreferences·크기)에서 실제 popup.html 을 띄워 페이지 내부 테스트 실행 — 화면에 아무것도 안 뜸 |
| `desktop/main.js` | YD_SMOKE `helper` 프로브(테이블·알려진 값), `setupAutoUpdater` 의 YD_SMOKE 스킵(패키지 exe 오프라인 스모크) |
| `.github/workflows/desktop-release.yml` | 패키지에 엔진 번들·테이블 포함 assert(Windows·mac), 주석 갱신 |
| `desktop/README.md` · `CLAUDE.md` | 헬퍼 섹션·단축키(H·Backspace)·빌드 타임 엔진 의존·"flagged"→"blocked" |

## 6. 데이터 흐름 / 동작 규칙

**조언 계산 조건**
- 솔로: `helperOn && helperTables[soloPreset].status==='ready' && state.rolled && state.turn<12` → `advise(soloEngineCard(), state.dice, state.rolls)`.
- 멀티: `mpRoom.helperAllowed && status==='playing' && 내 차례 && helperOn && rollsUsed>0 && dice.length===5` → `advise({scores: mySc(), masterCells: myMaster()}, room.dice, 3-rollsUsed)`, 테이블은 `mpRoom.rulePreset`.

**어댑터(솔로)** — `ENGINE_IDS[i]`(CATS 인덱스 정렬). `state.master` 칸 → `masterCells`, 나머지 기록 칸 → `scores`(달인 100 은 scores 에 넣지 않음).

**문구(우선순위 = 웹 HelperPanel)**
1. 요트의 달인: `요트의 달인! {칸} 칸에 기록 · +100`
2. 지금 기록: `지금 {칸}에 기록 · {n}점`
3. 리롤: `{보관 눈 ", "} 보관하고 다시 굴리기 · +{x.x}` / `모두 다시 굴리기 · +{x.x}`
- 우측 `예상 {Math.round(expectedFinalScore)}`. 대기 문구: `헬퍼 데이터 로딩 중…` / `헬퍼 데이터를 불러오지 못했습니다` / `주사위를 굴리면 최적의 수를 추천해 드려요.` / `추천을 계산하지 못했습니다`(흐림).

**표시** — 리롤 추천이면 추천 보관 주사위에 밑줄(`.die.rec`, 눈 다중집합 기준·이미 보관한 주사위 우선), 지금 기록/달인이면 추천 칸 테두리(`.cat.rec`).

**거버넌스**
- 솔로 조언이 렌더되는 순간 `helperUsed = true`(토글만으론 아님). OFF·undo·테이블 로드·멀티는 해제하지 않음, `reset()`(새로·다시·룰 칩)만 해제.
- 솔로 리더보드: `undoUsed || helperUsed` 면 등록 UI 숨김 + 사유(`헬퍼 사용` / `헬퍼·되돌리기 사용` / `↩ 되돌리기 사용` + ` — 리더보드 등록 제외`), `submitScore()` 조기 반환.
- 솔로 평균: `avgCommitOutgoing()`·`gameOver()` 완료 기록 모두 `helperUsed` 면 제외, 배지 `평균 미반영(헬퍼|헬퍼·되돌리기|되돌리기)`.
- 멀티: `mpRoom.helperAllowed` 면 등록 UI 숨김 + `헬퍼 허용 방 — 리더보드 등록 제외`, `mpSubmitScore()` 조기 반환(실제 사용 여부 무관).
- 방 만들기: `p_helper_allowed = 칩 && preset==='default'`(서버도 추가 룰은 강제 false). 대기실: `{룰} · 헬퍼 {허용|비허용}`.

**단축키 H** — `e.code==='KeyH'`, Ctrl/Alt/Meta 무시, 그 키가 칸/주사위 단축키 문자를 내면(비QWERTY) 기존 단축키 우선. 솔로는 오버레이 처리 뒤, 멀티는 채팅·INPUT 가드 뒤. **멀티에서는 '헬퍼 허용' 방의 내 차례에만 동작**(그때만 헬퍼 줄이 보여 즉시 확인 가능) — 비허용 방·상대 차례에선 공용·저장 설정을 바꾸지 않는다(최종 리뷰 MP-1: 보이지 않는 토글이 나중에 솔로 게임을 실격시키는 일 방지).

**솔로 복귀** — 트레이 '싱글플레이'(`yd.onMode` → `enterSolo()`)는 화면 전환 후 `render()` 로 다시 그린다. 멀티에 있는 동안의 H 토글·테이블 로드 완료는 숨은 솔로 보드에 그리지 않으며(실격 없음), 복귀해 실제로 보일 때 반영된다(최종 리뷰 UX-1·GOV-1).

## 7. 엣지 케이스 / 에러 처리

- 번들 없음(`YDEngine` 미정의)·카테고리 순서 불일치·fetch 실패(reject `TypeError`)·길이/sanity 불일치 → 상태 `error`, 헬퍼 줄에 오류 문구, 게임은 정상.
- `advise()` 예외(비정상 주사위·멀티 턴 사이 `dice=[]`) → try/catch, render 절대 안 깨짐. 카드 12칸 완료면 호출 안 함.
- 로드 완료 시 **보이는 화면만** 재렌더(숨은 보드에 조언 '표시' → 실격 방지).
- 멀티 `refetchRoom` 은 매 이벤트 객체 재생성 → 값 키 메모.
- 레이아웃: 한 줄만. 최악(추가 룰 `4/4 ✓ +50` 힌트 + 헬퍼 줄) 300% 배율 349/358 px. 판정은 문서 스크롤 기준.
- 헬퍼 줄로 멀티 메시지 예산 5→4줄 → `#mp-game-msg` 3줄 제한(전체는 title).
- 구버전 트레이(≤0.9.0)·mac 미재설치는 여전히 허용 방 점수 등록 가능 — 서버 변경 없이는 불가(기록만).
- Electron 메이저 업그레이드 시 file:// fetch(`GrantFileProtocolExtraPrivileges` 퓨즈 기본 ON) 재확인. 대체 경로(main fs + IPC invoke)는 검증됨.

## 8. 검증 계획

1. `npm run build:engine` — 테이블 크기 + 번들 자체 점검(알려진 추천값) 통과.
2. `npm run test:helper` — 숨은 창에서 실제 popup.html: 솔로 표시(문구·값·표시·두 테마 레이아웃·H 키), 거버넌스(실격 시점·undo·reset·게임오버·평균·submit 가드), 멀티(표시 조건·값·로비 줄·방 만들기 칩·create_room 파라미터·게임오버 게이트·긴 오류 3줄 제한).
3. 실제 `main.js` YD_SMOKE(dev) — `helper` 프로브 OK + 기존 opacity/drag/persist 회귀 없음.
4. `npx electron-builder --dir` 패키지 — `resources/public/V*.bin` 크기 + `app.asar` 안 `vendor/yd-engine.js`, 그리고 `release/win-unpacked/Yacht Dice.exe` YD_SMOKE 로 패키지 경로 테이블 로드 확인.
5. 루트 `npm run typecheck` / `npm test` 무영향 확인.

## 9. 릴리스 메모(범위 밖 참고)

머지 후 별도: 트레이 0.10.0 버전 범프 PR(`desktop/package.json` + lockfile) → `tray-v0.10.0` 태그·Release 발행(Windows 자동 업데이트, mac 은 dmg 재다운로드) → 웹 `CHANGELOG` 공지 + `web-v` 태그.
