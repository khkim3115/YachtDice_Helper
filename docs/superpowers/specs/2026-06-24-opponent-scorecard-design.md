# 설계: 다른 사람 점수 상세 확인 (이슈 #16)

- 이슈: [#16](https://github.com/khkim3115/YachtDice_Helper/issues/16) — 다른사람 점수 상세 확인 기능 추가
- 마일스톤: 멀티플레이 경험 개선 (#16 닫혀도 #18 때문에 마일스톤은 열어둠)
- 브랜치: `feat/16-opponent-scorecard` → PR `Closes #16` → squash
- 규모: M. 웹(src/)과 데스크톱(desktop/popup.html) 양쪽 변경.

## 목표

멀티플레이 중 상대 플레이어가 어느 칸에 얼마를 기록했는지 상세 점수표를 확인할 수 있게 한다.

- 웹: 항상 본인/현재 차례 점수표가 보이고, 미니 카드를 클릭하면 그 플레이어의 상세 점수표가 보인다.
- 데스크톱 트레이: 백틱(`` ` ``) 패널의 플레이어 목록 아래에 선택 플레이어 상세 점수표를 렌더하고, ↑/↓로 선택을 이동한다.

## 데이터 (변경 없음)

모든 플레이어의 `scorecard`(`room_players.scorecard` jsonb)가 이미 Realtime으로 동기화된다
(`MpPlayer.scorecard`). **백엔드/RLS/RPC/schema.sql 변경 불필요.** 선택 상태(`selectedSeat`)는
순수 로컬 UI 상태로 서버 권한 모델과 무관하다.

## 조회 정책 (확정)

**"내 차례 시 내 카드로 복귀"** — 웹:
- 기본 표시 = `selectedSeat ?? 현재 턴 좌석(active)`.
- 미니 클릭으로 상대를 핀하면 그 카드를 읽기전용으로 본다.
- 내 차례가 시작되면 선택을 자동 해제(`selectPlayer(null)`)하여 내 카드로 복귀한다.
  → 굴리기/기록 조작과 헬퍼 EV가 항상 내 카드 기준으로 일치한다.

데스크톱은 좌측 보드가 **항상 내 카드**(`mySc()`)이므로 상호작용 충돌이 없다. 우측 백틱 패널은
순수 뷰어이므로 **핀을 유지**(자동 전환 없음)하고, 선택 플레이어가 떠나면 내 좌석으로 폴백한다.

## 웹 (React)

### 1. `src/store/multiplayerStore.ts`
- 상태 `selectedSeat: number | null` 추가 (null = 현재 턴 따라가기).
- 액션 `selectPlayer(seat: number | null)` 추가 (단순 setter).
- 좌석 토글은 컴포넌트에서: 이미 선택된 미니를 다시 누르면 null로(따라가기 복귀).

### 2. `src/ui/MultiplayerGame.tsx`
- `displaySeat = selectedSeat ?? room.currentSeat`, `viewPlayer = players[seat === displaySeat]`.
- `isViewingOther = selectedSeat != null && selectedSeat !== room.currentSeat` 일 때만
  `<Scorecard viewCard={viewPlayer.scorecard} />`(읽기전용), 그 외에는 기존
  `<Scorecard advice={advice} />`(라이브/조작 가능).
- 라벨: `{viewPlayer.displayName} 님의 점수표`.
- `ScorecardMini`에 `selected={p.seat === displaySeat}`, `onClick={() => selectPlayer(p.seat === selectedSeat ? null : p.seat)}` 전달.
- 자동 복귀 `useEffect`:
  - 내 차례가 되면 `selectPlayer(null)`.
  - `selectedSeat`가 더 이상 `players`에 없으면(상대 퇴장) `selectPlayer(null)`.

### 3. `src/ui/Scorecard.tsx` (작은 옵션 prop 추가)
- 이슈 본문은 "변경 불필요"라 했으나, `Scorecard`/`DiceTray`가 `useBoard`를 공유하므로
  선택을 `useBoard`에 넣으면 **주사위 트레이까지 바뀐다**. 따라서 선택은 Scorecard 패널에만
  영향을 주도록 prop으로 전달한다(DiceTray 무영향).
- `viewCard?: Scorecard` prop 추가. 주어지면:
  - 그 카드를 표시하고 **강제 읽기전용**.
  - 주사위 미리보기·EV·추천 배지를 **모두 숨김**(주사위는 라이브 굴림자 것이라 남의 카드엔 무의미).
  - 상단 합/보너스는 `viewCard` 기준으로 계산.

### 4. `src/ui/ScorecardMini.tsx` + `src/index.css`
- `selected?: boolean`, `onClick?: () => void` prop 추가.
- `.mini.selected` 강조 스타일 + `cursor: pointer`, 클릭 시 `role="button"`.

## 데스크톱 (`desktop/popup.html`) — 2열 그리드, 폭 410px 유지

### 1. 상태
- `let mpSelectedSeat = null;` (null → 내 좌석으로 해석). 선택 좌석이 목록에 없으면 내 좌석 폴백.
- `setSideSeat(seat)`: `mpSelectedSeat` 갱신 후 `renderSide()` 재렌더.

### 2. `renderSide()` 리팩토링
- 플레이어 행에 `data-seat` + 클릭 핸들러(→ `setSideSeat`).
- 선택 행 `.selected` + `▸` 마커(현재 턴은 기존 `.turn` 테두리 유지, 둘 겹칠 수 있음).
- 목록 끝에 `renderSideDetail()` 호출.

### 3. 신규 `renderSideDetail()`
- 선택 플레이어 이름 헤더 + 2열 그리드: `i행 = 상단[i] | 하단[i]`
  (원/투/쓰리/포/파이브/식스 좌, 초이스/포카드/풀하우스/스몰/라지/야추 우), 미기록은 `·`.
- 요약: `상단 합 N/63` + 보너스 달성 여부 + `합 총점`(`scorecardTotal`).

### 4. 키보드
- 백틱 패널이 열려 있을 때 `↑/↓`로 선택 좌석 이동(좌석 정렬 후 인덱스 클램프), 턴과 무관하게 작동.
- `e.preventDefault()`로 스크롤 등 방지.

### 5. CSS
- `.mp-prow` 클릭 커서, `.mp-prow.selected` 강조.
- `.mp-side-detail` / 2열 그리드 / 요약 컴팩트 스타일(다크·라이트 CSS 변수 사용).
- `main.js` 무변경 (MP_W_WIDE 410px 유지, 우측 ≈124px로 충분).

## 완료 조건 (이슈 AC 매핑)

- [ ] 웹: 미니 클릭 시 해당 플레이어 scorecard 표시 + 선택 카드 강조.
- [ ] 웹: 시작 시 기본 = 현재 차례(`selectedSeat ?? active`), 내 차례 시작 시 자동 복귀.
- [ ] 데스크톱: 백틱 패널에 선택 플레이어 카테고리·점수 2열 그리드 렌더.
- [ ] 데스크톱: 패널 열린 상태에서 ↑/↓로 선택 전환 + 행 하이라이트.
- [ ] 2인 게임 수동 테스트: 상대 카드 점수 일치.
- [ ] 데스크톱 폭 전환(백틱) 시 선택 상태 유지.

## 검증

- 웹: `npm run typecheck` + `npm test` 통과. dev(5173)에서 미니 클릭→카드 전환+강조, 내 차례 복귀 확인.
- 데스크톱: http-server로 `desktop/` 서빙 → preview에서 `mpRoom`/players/scorecard 주입,
  백틱 패널·↑/↓·2열 그리드 동작 + 다크/라이트 가시성 확인.

## 반영 정책 (이번 PR 범위 제외)

- changelog.ts 항목/버전 범프 **넣지 않음**(웹 패치노트는 모아서 별도).
- desktop/package.json 버전 범프 **넣지 않음**(데스크톱 릴리스는 #17/#18과 모아서).
- 마일스톤은 #18이 남아 있으므로 열어둔다.
