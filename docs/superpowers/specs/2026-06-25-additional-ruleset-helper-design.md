# 추가 룰(additional) 최적-EV 헬퍼 설계

- **이슈:** #40 — 추가 룰(요트의 달인·요트도 포커처럼) 최적-EV 헬퍼 지원
- **마일스톤:** #3 게임 룰 확장
- **규모:** L (솔버 재설계 포함)
- **날짜:** 2026-06-25
- **상태:** 합의 완료(상태공간 인코딩·패킹·precache·PR 분할) → 구현 계획 단계로

## 1. 목표

`additional` 프리셋(`ADDITIONAL_RULES`)에서 헬퍼(V.bin/솔버)를 켜서, 두 보너스 규칙을
정확히 반영한 **게임 전체 최적 기대값·보관 추천·카테고리 EV·콤보 확률**을 제공한다.

완료 조건(이슈 #40):
- 추가 룰에서 헬퍼가 정확한 최적 EV / 카테고리 EV / 콤보 확률 제공
- 추가 룰용 V.bin 생성·런타임 로드, PWA precache 전략 반영
- 추가 룰 시뮬레이션이 테이블 예측 평균에 수렴(전용 베이스라인 산출)
- 기본 룰 헬퍼/`V.bin`(≈191.8) 무영향 회귀 확인

## 2. 두 보너스 규칙(코드로 확인한 정확한 의미)

`core/scoring.ts`·엔진은 보너스를 모른다. 보너스는 `core/gameState.ts`·store·server에만 존재.

### 2.1 요트의 달인 (`multiYachtBonus`, +100)
요트(yacht=50)를 이미 기록한 뒤, 어떤 턴의 **최종 주사위가 5-of-a-kind**면 빈 칸 1개를
소비해 +100을 적는다(반복 가능). +100은 **총점에만** 더하고 상단 소계·요트도 포커처럼
판정에서는 제외(소비된 칸은 `masterCells`에만 들어가고 `scores`에 없음).

**핵심 발견 — 윈드폴은 강제다.** 실제 게임([`gameStore.ts assign`](../../../src/store/gameStore.ts),
서버 `_apply_assignment`)은 `multiYachtBonus && scores.yacht===50 && isFiveOfAKind(dice)`이면
**모든 칸 클릭이 +100 master 배치로 강제** 변환된다 — 그 5-of-a-kind를 정상 채점할 UI가 없다.
따라서 DP는 그 leaf에서 **정상 채점 옵션 없이 윈드폴만** 모델링해야 실제 플레이의 EV와 일치한다.
(실전에서는 +100이 정상 채점을 거의 항상 지배하므로 선택을 바꾸는 일은 드물지만, 정확성을 위해 강제로 모델링.)

### 2.2 요트도 포커처럼 (`lowerFourBonus`, +50)
하단 4종(`fourKind`·`fullHouse`·`smallStraight`·`largeStraight`, `LOWER_FOUR_CATEGORIES`)을
**모두 실제 조합(>0)** 으로 채우면 칸 소비 없이 총점 +50. 0점 덤프·master 칸은 인정 안 됨.

## 3. 상태공간 인코딩 (합의: 2비트 naive ×4)

기존 between-turn 상태 `(12비트 채움 마스크) × (상단 소계 0..63)` = 262144에 **이력 2비트** 추가:

| 비트 | 의미 | 카드에서 도출 |
|---|---|---|
| `yachtFifty` (yf) | 요트를 실제 50으로 기록 → 윈드폴 게이트 | `scores.yacht === rules.yachtScore` |
| `lowerAlive` (la) | +50이 **아직 달성 가능**(하단 4종 어느 것도 비실제 점유 안 됨) | 아래 식 |

`lowerAlive` = 하단 4종 각각이 (비어 있음) 또는 (실제 >0)일 때 true. 0-덤프 또는 master 점유 시 false.
이는 이슈 #40의 "1비트로 축약 가능한가" 질문에 대한 답: **가능하되 "+50 획득"이 아니라
"아직 살아있음"이어야 한다.** (같은 마스크라도 "하단 덤프됨(죽음)" vs "아직 비어있음(살아있음)"은
미래가치가 다른데 "획득" 비트로는 구분 불가. 마스크와 결합하면 alive=false→불가능, alive=true &
하단4종 모두 set→획득, alive=true & 일부 미set→진행 중.)

**3번째 차원 불필요:** master 칸 개수는 `alreadyTotal`(grandTotal)에 이미 적립되고, 소비된 칸은
마스크 비트로 드러난다.

### 패킹 / 용량
```
indexAdditional(mask, upper, yf, la) = (mask * 64 + upper) * 4 + (yf?2:0) + (la?1:0)
STATE_COUNT_ADDITIONAL = 262144 * 4 = 1,048,576
파일 = 1,048,576 * 4B = 4,194,304B = 정확히 4.00 MiB (Float32 LE)
```
도달 불가 조합(yf=true인데 yacht 미set; la=false인데 하단4종 미set)은 빌드 시 **계산 생략**(0으로 남김,
런타임에서 절대 참조 안 됨). 실제 계산 상태 ≈ 762K → 빌드 시간 추정 ~30–40s(기본 ~10s 대비).

## 4. 턴 내 DP 변경 (leaf만 변경, 나머지 재사용)

상태 `(mask, upper, yf, la)`에서 손패 `h`별 leaf:

- **`yf && h가 5-of-a-kind`** → **강제 윈드폴**:
  `leaf[h] = 100 + max_{빈 칸 c} V(mask|bit_c, upper, yf=true, la && c∉하단4종)`
  (가장 덜 아까운 빈 칸을 희생; 하단4종 칸을 소비하면 la→false. 정상 채점 옵션 없음.)
- **그 외** → 정상 채점(기존 로직) + 다음 전이/보너스:
  - `nextYf = yf || (c==yacht && raw>0)`
  - 하단4종 `c`: `nextLa = la && (raw>0)`; 그 외 `nextLa = la`
  - **+50 적립:** `c`가 하단4종 && `raw>0` && `la` && 이 채움으로 하단4종 4비트 전부 set 완성 시 cand에 +50
  - 상단 보너스(+35)·상단 소계 전이는 기존과 동일
  - `cand = raw + 상단보너스 + (해당 시)50 + V(mask|bit_c, nextUpper, nextYf, nextLa)`

`solveLayers`(키프 전이 EV 전파), 카테고리별 `columnLeaf`(원점수), `comboProbability`(0/1 지시 leaf)는
**그대로** 재사용 — 3-way 재사용 불변. 카테고리별 EV는 기존처럼 원점수 기반 유지(알려진 단순화;
메인 추천은 모든 보너스를 반영).

`V_additional(0, 0, false, true)` = 추가 룰 최적 평균(>191.8) → 새 베이스라인.

## 5. 보너스 이중계산 없음 (검증)
`grandTotal(card)`는 이미 `masterBonusTotal`(과거 +100)·`lowerFourBonus`(완성 시 +50)를 더한다.
V_additional은 **미래 추가점수만**(미래 윈드폴·미래 +50 완성 포함, 이미 적립분 제외) 표현하므로
`expectedFinalScore = grandTotal(card) + V_additional(현재상태)`가 일관(이중계산 없음).
- 하단4종 미완성·alive: grandTotal에 +50 없음 → V가 완성 전이에서 +50 적립. ✔
- 하단4종 완성: grandTotal에 +50 포함, 이후 하단4종 채움 없어 V가 재적립 안 함. ✔

## 6. 손댈 파일 (기본 룰 경로는 절대 변경 금지)

### PR1 — 엔진/테이블 (헬퍼는 여전히 off)
- `src/core/stateIndex.ts`: **추가** `STATE_COUNT_ADDITIONAL`, `packStateAdditional`,
  `YACHT_BIT`/`LOWER_FOUR_BITS` 상수, `getVAdditional` 인덱스 헬퍼. (기존 export 불변.)
- `src/core/gameState.ts`: **추가** `additionalStateOf(card, rules)` → `{mask, upper, yf, la}`.
- `src/engine/optimalLeaf.ts`: **추가** `buildOptimalLeafAdditional(...)` +
  `scoreNowChoiceForHandAdditional(...)`(윈드폴/하단4종/yf/la 처리). 기존 함수 불변. `HAND_IS_FIVE_KIND[252]` 사전계산.
- `src/precompute/buildValueTable.ts`: CLI 인자로 preset 파라미터화
  (`tsx ... [default|additional]`). default 경로는 기존 코드 그대로; additional 분기에서
  4-차원 popcount 루프(도달불가 생략) → `public/V.additional.bin` 출력. 빈 카드 최적 평균 출력.
- `src/engine/valueTable.ts`: `loadValueTable(url, expectedLen)` 또는 preset별 래퍼로
  길이 검증 파라미터화(기본 262144, additional 1,048,576). 기존 시그니처 호환 유지.
- `src/engine/simulate.ts`: additional-aware 정책/게임 루프 추가(결정에 additional V+leaf 사용,
  윈드폴 강제 배치·+100·+50을 `gameState` 함수로 적용, 최종점수 `grandTotal`). 수렴 테스트용.
- `package.json`: `build:table:additional` 스크립트 + `prebuild`에서 default·additional 둘 다 생성.
- **테스트**: `src/engine/additionalSolver.test.ts` — `V.additional.bin` 로드,
  `optimalAvg = getVAdditional(0,0,false,true)` 합리 범위, `simulateMany(..., ADDITIONAL_RULES)` 수렴(±5),
  std>0. 인코딩/패킹 단위테스트(packStateAdditional 왕복, getVAdditional). 기본 `solver.test.ts` 무영향.
- `public/V.additional.bin` 커밋(또는 prebuild로 재생성 — default와 동일 정책).

### PR2 — 연결/UI (헬퍼 ON)
- `src/engine/advisor.ts`: preset 분기 — additional이면 `buildOptimalLeafAdditional` +
  `getVAdditional` + `additionalStateOf` 사용. `Advice`에 윈드폴 필드 추가
  (예: `windfall?: { active: boolean; bonus: number; category: CategoryId }` — 강제 윈드폴 시
  `bestCategory`=희생할 최적 빈 칸, UI가 +100 배치로 안내).
- `src/store/gameStore.ts`: `loadTable()` preset별 파일/상태수/advisor 생성(additional 분기),
  `helperSupported` 게이트 완화.
- `src/store/useBoard.ts` / `src/ui/App.tsx`: `helperSupported` 기반 비활성 제거(추가 룰도 지원).
- `src/ui/`(`HelperPanel`/`DiceTray`/`Scorecard`/`SettingsPanel`/`Home`): 윈드폴 추천 표시,
  "추가 룰 헬퍼 미지원" 문구 제거/수정.
- `src/core/rules.ts`: `RULE_PRESETS.additional.helperSupported = true` (**엔진 준비 후 마지막에**).
  ⚠️ `DEFAULT_RULES`/`ADDITIONAL_RULES`/`CATEGORY_IDS`/`RuleConfig` 필드는 **변경 없음**
  (ADDITIONAL_RULES에 필요한 4개 플래그가 이미 존재 → 기본 V.bin 무효화 없음).
- `vite.config.ts`: `maximumFileSizeToCacheInBytes`를 6–8MB로 상향(추가 4MB precache 허용).
  `globPatterns`는 이미 `bin` 포함 → V.additional.bin 자동 precache. 총 precache 용량 확인.

## 7. 불변식 (반드시 보존)
- `DEFAULT_RULES`, `CATEGORY_IDS` 순서, `packState`/`STATE_COUNT`(기본), `public/V.bin`(≈191.8) **불변**.
- 추가 전용은 전부 별도 객체/파일/상태수/함수. 기본 룰 헬퍼·테스트 영향 0.
- 검증: `npm run typecheck` / `npm test` / `npm run build` 통과 + additional 수렴 베이스라인 산출 +
  빌드 시간/용량 측정 기록.

## 8. 위험 / 측정
- **테이블 손상(최대 위험):** packStateAdditional/getVAdditional/빌드 루프가 정확히 일치해야 함.
  단위테스트로 왕복·경계(yf/la 전이) 검증. naive 패킹 선택 이유 = 단순성으로 위험 최소화.
- **빌드 시간/용량:** additional ~30–40s, 4.00MiB — 실제 측정해 기록(이슈 완료조건).
- **precache 총량:** base 1MB + additional 4MB + 앱 자산 → SW precache 용량/한도 확인.
- **simulate 정확성:** additional 시뮬은 윈드폴 강제·+50·+100을 게임과 동일하게 적용해야 수렴.
