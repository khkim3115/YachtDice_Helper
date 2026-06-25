# 추가 룰(additional) 최적-EV 헬퍼 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `additional` 프리셋에서 두 보너스 규칙(요트의 달인 +100·요트도 포커처럼 +50)을 정확히 반영한 최적-EV 헬퍼를 켠다.

**Architecture:** 기존 between-turn 상태 `(12비트 마스크 × 상단 0..63)`에 이력 2비트(`yachtFifty`·`lowerAlive`)를 추가해 naive ×4로 패킹한 별도 테이블 `public/V.additional.bin`(1,048,576 states, 4.00 MiB)을 만든다. 윈드폴은 within-turn leaf의 강제 분기로 모델링하고, +50은 하단4종 실제 완성 전이에서 즉시 적립한다. 기본 룰 경로(`V.bin`, ≈191.8)는 바이트 단위로 불변.

**Tech Stack:** React 19 + Vite + TypeScript, Zustand, vitest(node 환경), tsx(Node 사전계산), vite-plugin-pwa(Workbox).

## Global Constraints

- **CATEGORY_IDS 순서 불변** = V.bin 비트 인덱스(0..11): `ones,twos,threes,fours,fives,sixes,choice,fourKind,fullHouse,smallStraight,largeStraight,yacht`. yacht=11, 하단4종=7,8,9,10.
- **`DEFAULT_RULES`·`ADDITIONAL_RULES`·`RuleConfig` 필드 변경 금지** — `ADDITIONAL_RULES`에 필요한 4개 플래그(`multiYachtBonus:true, multiYachtBonusAmount:100, lowerFourBonus:true, lowerFourBonusAmount:50`)가 이미 존재. 기본 V.bin 무효화 없음.
- **기본 레이아웃 불변:** `packState(mask,upper)=mask*64+upper`, `UPPER_LEVELS=64`, `UPPER_CAP=63`, `STATE_COUNT=262144`. 기존 export 시그니처 유지. 추가 전용은 전부 **새** 심볼/파일.
- **추가 패킹(확정):** `indexAdditional(mask,upper,yf,la) = (mask*64+upper)*4 + (yf?2:0) + (la?1:0)`, `STATE_COUNT_ADDITIONAL = 1,048,576`.
- **윈드폴은 강제:** `yf && 최종 5-of-a-kind`이면 정상 채점 옵션 없이 +100 + 최적 빈 칸 희생(게임 코드 `assign`·서버 `_apply_assignment`와 일치).
- **lowerAlive 정의:** +50이 아직 달성 가능(하단4종 어느 것도 0-덤프/마스터로 비실제 점유 안 됨). 카드에서 `LOWER_FOUR_CATEGORIES.every(빈 || >0, 마스터면 false)`.
- **검증 명령:** `npm run typecheck`, `npm test`, `npm run build`. 단일 테스트: `npx vitest run <file>`.
- **멀티/리더보드/DB 무관:** 서버가 additional 방 `helper_allowed=false` 강제(확인됨). 이 작업은 **솔로 헬퍼만**. MP 동작 0 변경.

## File Structure

**PR1 — 엔진/테이블 (헬퍼 여전히 off):**
- `src/core/stateIndex.ts` (수정) — 추가 패킹/상수.
- `src/core/gameState.ts` (수정) — `yachtFiftyOf`·`lowerAliveOf`.
- `src/engine/optimalLeaf.ts` (수정) — `buildOptimalLeafAdditional`·`scoreNowChoiceForHandAdditional`·`HAND_IS_FIVE_KIND`.
- `src/engine/valueTable.ts` (수정) — `getVAdditional`.
- `src/precompute/buildValueTable.ts` (수정) — 프리셋 파라미터화 + additional 빌드.
- `src/engine/simulate.ts` (수정) — additional 정책(`playOneGameAdditional`).
- `package.json` (수정) — `build:table:additional`, `prebuild` 둘 다.
- `public/V.additional.bin` (생성·커밋).
- `src/core/stateIndex.test.ts`, `src/core/gameStateAdditional.test.ts`, `src/engine/optimalLeafAdditional.test.ts`, `src/engine/additionalSolver.test.ts` (생성).

**PR2 — 연결/UI (헬퍼 ON):**
- `src/engine/valueTable.ts` (수정) — `loadValueTable(url, expectedLength)`.
- `src/engine/advisor.ts` (수정) — additional 분기 + `Advice.windfall`.
- `src/store/gameStore.ts` (수정) — 프리셋별 로드/리셋, `advisorPreset`.
- `src/store/useBoard.ts` (수정) — `rulePreset` 노출.
- `src/store/useAdvice.ts` (수정) — advisor↔board 프리셋 일치 가드.
- `src/ui/App.tsx` (수정) — preset 의존 prefetch.
- `src/ui/HelperPanel.tsx` (수정) — 윈드폴 배너.
- `src/ui/Home.tsx` (수정) — MP 토글을 서버 진실 기준으로 유지(동작 불변).
- `src/core/rules.ts` (수정) — `additional.helperSupported = true` (**마지막**).
- `vite.config.ts` (수정) — `maximumFileSizeToCacheInBytes` 상향.
- `src/engine/advisorAdditional.test.ts` (생성).

---

# PR 1 — 엔진 / 테이블

## Task 1: 추가 상태 패킹 (`stateIndex.ts`)

**Files:**
- Modify: `src/core/stateIndex.ts`
- Test: `src/core/stateIndex.test.ts` (create)

**Interfaces:**
- Produces: `STATE_COUNT_ADDITIONAL: number` (=1048576), `YACHT_BIT: number` (=2048), `YACHT_INDEX: number` (=11), `LOWER_FOUR_BITS: number` (=1920), `packStateAdditional(filledMask, upperCapped, yachtFifty, lowerAlive): number`.

- [ ] **Step 1: Write the failing test**

Create `src/core/stateIndex.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  STATE_COUNT_ADDITIONAL,
  YACHT_BIT,
  YACHT_INDEX,
  LOWER_FOUR_BITS,
  packStateAdditional,
} from './stateIndex';

describe('추가 상태 패킹', () => {
  it('상수값', () => {
    expect(STATE_COUNT_ADDITIONAL).toBe(1_048_576);
    expect(YACHT_INDEX).toBe(11);
    expect(YACHT_BIT).toBe(1 << 11);
    expect(LOWER_FOUR_BITS).toBe((1 << 7) | (1 << 8) | (1 << 9) | (1 << 10));
  });

  it('빈 카드 4조합이 0..3', () => {
    expect(packStateAdditional(0, 0, false, false)).toBe(0);
    expect(packStateAdditional(0, 0, false, true)).toBe(1);
    expect(packStateAdditional(0, 0, true, false)).toBe(2);
    expect(packStateAdditional(0, 0, true, true)).toBe(3);
  });

  it('최대 인덱스 = STATE_COUNT_ADDITIONAL-1, 충돌 없음', () => {
    expect(packStateAdditional(4095, 63, true, true)).toBe(STATE_COUNT_ADDITIONAL - 1);
    const seen = new Set<number>();
    for (const yf of [false, true]) {
      for (const la of [false, true]) {
        for (let upper = 0; upper < 64; upper++) {
          const idx = packStateAdditional(123, upper, yf, la);
          expect(seen.has(idx)).toBe(false);
          seen.add(idx);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/stateIndex.test.ts`
Expected: FAIL — `STATE_COUNT_ADDITIONAL` is not exported.

- [ ] **Step 3: Add the additional packing to `stateIndex.ts`**

Append after the existing `capUpper` function (do NOT touch existing exports), and add the import for `CATEGORY_IDS`:

Change the import line at top from:
```ts
import { CATEGORY_IDS, UPPER_CATEGORIES, NUM_CATEGORIES } from './rules';
```
(already imports `CATEGORY_IDS` — keep as is). Then append:

```ts
// ── 추가 룰(additional) 전용 패킹 ──────────────────────────────────────
// 상태 = (12비트 마스크 × 상단 0..63) × yachtFifty(1) × lowerAlive(1).
// index = (mask*64 + upper) * 4 + (yf?2:0) + (la?1:0). 기본 레이아웃과 별개.
export const STATE_COUNT_ADDITIONAL = STATE_COUNT * 4; // 1,048,576

/** yacht 카테고리 인덱스/비트(요트의 달인 게이트). */
export const YACHT_INDEX = CATEGORY_IDS.indexOf('yacht'); // 11
export const YACHT_BIT = 1 << YACHT_INDEX; // 2048

/** 하단 4종(fourKind·fullHouse·smallStraight·largeStraight) 비트 합. */
export const LOWER_FOUR_BITS = (1 << 7) | (1 << 8) | (1 << 9) | (1 << 10); // 1920

export function packStateAdditional(
  filledMask: number,
  upperCapped: number,
  yachtFifty: boolean,
  lowerAlive: boolean,
): number {
  return (filledMask * UPPER_LEVELS + upperCapped) * 4 + (yachtFifty ? 2 : 0) + (lowerAlive ? 1 : 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/stateIndex.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/stateIndex.ts src/core/stateIndex.test.ts
git commit -m "feat(engine): 추가 룰 상태 패킹 packStateAdditional (#40)"
```

---

## Task 2: 카드 → 추가 상태 비트 (`gameState.ts`)

**Files:**
- Modify: `src/core/gameState.ts`
- Test: `src/core/gameStateAdditional.test.ts` (create)

**Interfaces:**
- Consumes: `Scorecard`, `RuleConfig`, `LOWER_FOUR_CATEGORIES`, `isMasterCell` (existing).
- Produces: `yachtFiftyOf(card, rules): boolean`, `lowerAliveOf(card, rules): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/core/gameStateAdditional.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ADDITIONAL_RULES } from './rules';
import {
  createScorecard,
  recordScore,
  recordMasterYachtBonus,
  yachtFiftyOf,
  lowerAliveOf,
} from './gameState';

const R = ADDITIONAL_RULES;

describe('yachtFiftyOf', () => {
  it('요트 50 기록 시 true', () => {
    expect(yachtFiftyOf(recordScore(createScorecard(), 'yacht', 50), R)).toBe(true);
  });
  it('요트 0 덤프/미기록 시 false', () => {
    expect(yachtFiftyOf(recordScore(createScorecard(), 'yacht', 0), R)).toBe(false);
    expect(yachtFiftyOf(createScorecard(), R)).toBe(false);
  });
});

describe('lowerAliveOf', () => {
  it('빈 카드는 alive', () => {
    expect(lowerAliveOf(createScorecard(), R)).toBe(true);
  });
  it('하단4종 실제(>0)는 alive 유지', () => {
    const c = recordScore(createScorecard(), 'fourKind', 20);
    expect(lowerAliveOf(c, R)).toBe(true);
  });
  it('하단4종 0-덤프는 dead', () => {
    const c = recordScore(createScorecard(), 'smallStraight', 0);
    expect(lowerAliveOf(c, R)).toBe(false);
  });
  it('하단4종 마스터 칸 점유는 dead', () => {
    const c = recordMasterYachtBonus(createScorecard(), 'largeStraight');
    expect(lowerAliveOf(c, R)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/gameStateAdditional.test.ts`
Expected: FAIL — `yachtFiftyOf` is not exported.

- [ ] **Step 3: Add the two helpers to `gameState.ts`**

Append after `cappedUpperOf` (end of file). `LOWER_FOUR_CATEGORIES` and `isMasterCell` are already imported/defined in this file:

```ts
/** 요트의 달인 게이트: 요트를 실제 50으로 기록했는가(추가 룰 전용 상태 비트). */
export function yachtFiftyOf(card: Scorecard, rules: RuleConfig): boolean {
  return rules.yachtScore > 0 && (card.scores.yacht ?? -1) === rules.yachtScore;
}

/** 요트도 포커처럼 +50이 아직 달성 가능한가(하단4종 비실제 점유 없음). 추가 룰 전용 상태 비트. */
export function lowerAliveOf(card: Scorecard, _rules: RuleConfig): boolean {
  return LOWER_FOUR_CATEGORIES.every((cat) => {
    if (isMasterCell(card, cat)) return false; // 마스터 칸 = 비실제 점유 → 죽음
    const s = card.scores[cat];
    return s === undefined ? true : s > 0; // 비어있으면 살아있음, 채웠으면 실제(>0)여야 함
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/gameStateAdditional.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/gameState.ts src/core/gameStateAdditional.test.ts
git commit -m "feat(core): 카드→추가 상태 비트 yachtFiftyOf·lowerAliveOf (#40)"
```

---

## Task 3: 추가 룰 leaf 빌더 (`optimalLeaf.ts`) — 핵심

**Files:**
- Modify: `src/engine/optimalLeaf.ts`
- Test: `src/engine/optimalLeafAdditional.test.ts` (create)

**Interfaces:**
- Consumes: `scoreTable` (`buildScoreTable`), `STATE_COUNT_ADDITIONAL`/`LOWER_FOUR_BITS`/`YACHT_INDEX` from `stateIndex`, `ALL_HANDS`/`HAND_COUNT`/`handIndexOfDice` from `dice`.
- Produces:
  - `HAND_IS_FIVE_KIND: boolean[]` (length 252)
  - `buildOptimalLeafAdditional(scoreTable, V, filledMask, cappedUpper, yachtFifty, lowerAlive, rules): Float64Array`
  - `scoreNowChoiceForHandAdditional(scoreTable, V, filledMask, cappedUpper, yachtFifty, lowerAlive, rules, handIndex): ScoreNowChoiceAdditional`
  - `interface ScoreNowChoiceAdditional { categoryIndex: number; value: number; rawScore: number; isWindfall: boolean }`

- [ ] **Step 1: Write the failing test**

Create `src/engine/optimalLeafAdditional.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALL_HANDS, handIndexOfDice } from '../core/dice';
import { ADDITIONAL_RULES, CATEGORY_IDS } from '../core/rules';
import { STATE_COUNT_ADDITIONAL } from '../core/stateIndex';
import { buildScoreTable } from '../core/scoring';
import {
  HAND_IS_FIVE_KIND,
  buildOptimalLeafAdditional,
  scoreNowChoiceForHandAdditional,
} from './optimalLeaf';

const R = ADDITIONAL_RULES;
const scoreTable = buildScoreTable(ALL_HANDS, R);
const zeroV = new Float32Array(STATE_COUNT_ADDITIONAL); // V=0 → leaf = 즉시보상만

const bit = (id: string) => 1 << CATEGORY_IDS.indexOf(id as never);

describe('buildOptimalLeafAdditional', () => {
  it('HAND_IS_FIVE_KIND: 5개 같은 눈만 true', () => {
    expect(HAND_IS_FIVE_KIND[handIndexOfDice([6, 6, 6, 6, 6])]).toBe(true);
    expect(HAND_IS_FIVE_KIND[handIndexOfDice([6, 6, 6, 6, 1])]).toBe(false);
  });

  it('yf + 5-of-a-kind 는 강제 윈드폴(+100, 정상채점 무시)', () => {
    // 요트만 채운 마스크, 빈 칸 다수, yf=true. 5개 6 → 정상 sixes=30 대신 +100.
    const mask = bit('yacht');
    const leaf = buildOptimalLeafAdditional(scoreTable, zeroV, mask, 0, true, true, R);
    expect(leaf[handIndexOfDice([6, 6, 6, 6, 6])]).toBe(100);
  });

  it('yf=false 면 5-of-a-kind 도 정상 채점(윈드폴 없음)', () => {
    const mask = 0; // 아무것도 안 채움 → 5개6 best 정상 = yacht 50
    const leaf = buildOptimalLeafAdditional(scoreTable, zeroV, mask, 0, false, true, R);
    expect(leaf[handIndexOfDice([6, 6, 6, 6, 6])]).toBe(50);
  });

  it('하단4종 마지막 실제 완성 시 +50 적립(alive)', () => {
    // largeStraight 만 빈 칸. 나머지 11칸 채움(하단4종 중 3개는 in-mask).
    const ALL = (1 << 12) - 1;
    const mask = ALL & ~bit('largeStraight');
    const h = handIndexOfDice([2, 3, 4, 5, 6]); // largeStraight=30
    const aliveLeaf = buildOptimalLeafAdditional(scoreTable, zeroV, mask, 0, false, true, R);
    const deadLeaf = buildOptimalLeafAdditional(scoreTable, zeroV, mask, 0, false, false, R);
    expect(aliveLeaf[h]).toBe(80); // 30 + 50
    expect(deadLeaf[h]).toBe(30); // dead → +50 없음
  });
});

describe('scoreNowChoiceForHandAdditional', () => {
  it('윈드폴 시 isWindfall=true, value=100', () => {
    const mask = bit('yacht');
    const ch = scoreNowChoiceForHandAdditional(
      scoreTable, zeroV, mask, 0, true, true, R, handIndexOfDice([3, 3, 3, 3, 3]),
    );
    expect(ch.isWindfall).toBe(true);
    expect(ch.value).toBe(100);
  });
  it('정상 채점 시 isWindfall=false', () => {
    const ch = scoreNowChoiceForHandAdditional(
      scoreTable, zeroV, 0, 0, false, true, R, handIndexOfDice([1, 2, 3, 4, 6]),
    );
    expect(ch.isWindfall).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/optimalLeafAdditional.test.ts`
Expected: FAIL — `HAND_IS_FIVE_KIND` is not exported.

- [ ] **Step 3: Add the additional leaf builder to `optimalLeaf.ts`**

Update the imports at top of `optimalLeaf.ts` from:
```ts
import { HAND_COUNT } from '../core/dice';
import type { RuleConfig } from '../core/rules';
import { NUM_CATEGORIES } from '../core/rules';
import { IS_UPPER, UPPER_CAP, UPPER_LEVELS } from '../core/stateIndex';
```
to:
```ts
import { ALL_HANDS, HAND_COUNT } from '../core/dice';
import type { RuleConfig } from '../core/rules';
import { NUM_CATEGORIES } from '../core/rules';
import {
  IS_UPPER,
  LOWER_FOUR_BITS,
  UPPER_CAP,
  UPPER_LEVELS,
  YACHT_INDEX,
} from '../core/stateIndex';
```

Then append at end of file:

```ts
// ── 추가 룰(additional) leaf — 윈드폴 강제 + 하단4종 +50 + yf/la 전이 ─────────
// V 인덱스: ((mask*64 + upper) * 4) + (yf?2:0) + (la?1:0). zero-reroll 게임 전체 가치.

/** 손패별 5-of-a-kind 여부(252). 윈드폴 발동 판정용. */
export const HAND_IS_FIVE_KIND: boolean[] = ALL_HANDS.map(
  (c) => c[1] === 5 || c[2] === 5 || c[3] === 5 || c[4] === 5 || c[5] === 5 || c[6] === 5,
);

export interface ScoreNowChoiceAdditional {
  /** 선택한 빈 칸 인덱스(0..11). 윈드폴이면 희생할 칸. */
  categoryIndex: number;
  /** 그 선택의 게임 전체 가치(즉시보상 + 미래 V). */
  value: number;
  /** 정상 채점 시 즉시 점수. 윈드폴이면 0. */
  rawScore: number;
  /** 강제 윈드폴(+100 마스터 배치)인가. */
  isWindfall: boolean;
}

export function buildOptimalLeafAdditional(
  scoreTable: Float64Array,
  V: Float32Array | Float64Array,
  filledMask: number,
  cappedUpper: number,
  yachtFifty: boolean,
  lowerAlive: boolean,
  rules: RuleConfig,
): Float64Array {
  const leaf = new Float64Array(HAND_COUNT);
  const C = NUM_CATEGORIES;
  const threshold = rules.upperBonusThreshold;
  const amount = rules.upperBonusAmount;
  const lowerBonus = rules.lowerFourBonusAmount;
  const windfall = rules.multiYachtBonusAmount;
  for (let h = 0; h < HAND_COUNT; h++) {
    let best = -Infinity;
    if (yachtFifty && HAND_IS_FIVE_KIND[h]) {
      // 강제 윈드폴: 정상 채점 없이 +100 + 최적 빈 칸 희생(upper·yf 불변).
      for (let c = 0; c < C; c++) {
        if (filledMask & (1 << c)) continue;
        const nextMask = filledMask | (1 << c);
        const nextLa = lowerAlive && (LOWER_FOUR_BITS & (1 << c)) === 0;
        const idx = (nextMask * UPPER_LEVELS + cappedUpper) * 4 + 2 + (nextLa ? 1 : 0);
        const cand = windfall + V[idx];
        if (cand > best) best = cand;
      }
      leaf[h] = best;
      continue;
    }
    const base = h * C;
    for (let c = 0; c < C; c++) {
      if (filledMask & (1 << c)) continue;
      const raw = scoreTable[base + c];
      const nextMask = filledMask | (1 << c);
      const isLowerFour = (LOWER_FOUR_BITS & (1 << c)) !== 0;
      const nextYf = yachtFifty || (c === YACHT_INDEX && raw > 0);
      const nextLa = isLowerFour ? lowerAlive && raw > 0 : lowerAlive;
      let nextUpper = cappedUpper;
      let bonus = 0;
      if (IS_UPPER[c]) {
        const sum = cappedUpper + raw;
        nextUpper = sum > UPPER_CAP ? UPPER_CAP : sum;
        bonus = cappedUpper < threshold && sum >= threshold ? amount : 0;
      }
      let lf = 0;
      if (
        isLowerFour &&
        raw > 0 &&
        lowerAlive &&
        ((filledMask & LOWER_FOUR_BITS) | (1 << c)) === LOWER_FOUR_BITS
      ) {
        lf = lowerBonus; // 이 실제 채움이 하단4종을 완성 → +50
      }
      const idx = (nextMask * UPPER_LEVELS + nextUpper) * 4 + (nextYf ? 2 : 0) + (nextLa ? 1 : 0);
      const cand = raw + bonus + lf + V[idx];
      if (cand > best) best = cand;
    }
    leaf[h] = best;
  }
  return leaf;
}

/** 손패 1개의 추가 룰 "지금 기록" 최적 선택(윈드폴 포함). leaf 빌더와 동일 후보식. */
export function scoreNowChoiceForHandAdditional(
  scoreTable: Float64Array,
  V: Float32Array | Float64Array,
  filledMask: number,
  cappedUpper: number,
  yachtFifty: boolean,
  lowerAlive: boolean,
  rules: RuleConfig,
  handIndex: number,
): ScoreNowChoiceAdditional {
  const C = NUM_CATEGORIES;
  const threshold = rules.upperBonusThreshold;
  const amount = rules.upperBonusAmount;
  const lowerBonus = rules.lowerFourBonusAmount;
  const windfall = rules.multiYachtBonusAmount;
  let bestC = -1;
  let bestVal = -Infinity;
  let bestRaw = 0;
  const isWindfall = yachtFifty && HAND_IS_FIVE_KIND[handIndex];
  if (isWindfall) {
    for (let c = 0; c < C; c++) {
      if (filledMask & (1 << c)) continue;
      const nextMask = filledMask | (1 << c);
      const nextLa = lowerAlive && (LOWER_FOUR_BITS & (1 << c)) === 0;
      const idx = (nextMask * UPPER_LEVELS + cappedUpper) * 4 + 2 + (nextLa ? 1 : 0);
      const cand = windfall + V[idx];
      if (cand > bestVal) {
        bestVal = cand;
        bestC = c;
      }
    }
    return { categoryIndex: bestC, value: bestVal, rawScore: 0, isWindfall: true };
  }
  const base = handIndex * C;
  for (let c = 0; c < C; c++) {
    if (filledMask & (1 << c)) continue;
    const raw = scoreTable[base + c];
    const nextMask = filledMask | (1 << c);
    const isLowerFour = (LOWER_FOUR_BITS & (1 << c)) !== 0;
    const nextYf = yachtFifty || (c === YACHT_INDEX && raw > 0);
    const nextLa = isLowerFour ? lowerAlive && raw > 0 : lowerAlive;
    let nextUpper = cappedUpper;
    let bonus = 0;
    if (IS_UPPER[c]) {
      const sum = cappedUpper + raw;
      nextUpper = sum > UPPER_CAP ? UPPER_CAP : sum;
      bonus = cappedUpper < threshold && sum >= threshold ? amount : 0;
    }
    let lf = 0;
    if (
      isLowerFour &&
      raw > 0 &&
      lowerAlive &&
      ((filledMask & LOWER_FOUR_BITS) | (1 << c)) === LOWER_FOUR_BITS
    ) {
      lf = lowerBonus;
    }
    const idx = (nextMask * UPPER_LEVELS + nextUpper) * 4 + (nextYf ? 2 : 0) + (nextLa ? 1 : 0);
    const cand = raw + bonus + lf + V[idx];
    if (cand > bestVal) {
      bestVal = cand;
      bestC = c;
      bestRaw = raw;
    }
  }
  return { categoryIndex: bestC, value: bestVal, rawScore: bestRaw, isWindfall: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/optimalLeafAdditional.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/optimalLeaf.ts src/engine/optimalLeafAdditional.test.ts
git commit -m "feat(engine): 추가 룰 leaf(윈드폴 강제·하단4종 +50) 빌더 (#40)"
```

---

## Task 4: 추가 V 인덱스 접근자 (`valueTable.ts`)

**Files:**
- Modify: `src/engine/valueTable.ts`
- Test: `src/engine/valueTable.test.ts` (create)

**Interfaces:**
- Produces: `getVAdditional(table, filledMask, upperCapped, yachtFifty, lowerAlive): number`.

- [ ] **Step 1: Write the failing test**

Create `src/engine/valueTable.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STATE_COUNT_ADDITIONAL, packStateAdditional } from '../core/stateIndex';
import { getVAdditional } from './valueTable';

describe('getVAdditional', () => {
  it('packStateAdditional 과 동일 인덱싱', () => {
    const t = new Float32Array(STATE_COUNT_ADDITIONAL);
    t[packStateAdditional(123, 45, true, false)] = 7.5;
    expect(getVAdditional(t, 123, 45, true, false)).toBe(7.5);
    expect(getVAdditional(t, 123, 45, true, true)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/valueTable.test.ts`
Expected: FAIL — `getVAdditional` is not exported.

- [ ] **Step 3: Add `getVAdditional` to `valueTable.ts`**

Change the import line from:
```ts
import { STATE_COUNT, UPPER_LEVELS } from '../core/stateIndex';
```
to:
```ts
import { STATE_COUNT, UPPER_LEVELS } from '../core/stateIndex';
```
(unchanged) and append after `getV`:

```ts
/** 추가 룰 V 조회. (mask*64 + upper)*4 + yf*2 + la. */
export function getVAdditional(
  table: ValueTable,
  filledMask: number,
  upperCapped: number,
  yachtFifty: boolean,
  lowerAlive: boolean,
): number {
  return table[(filledMask * UPPER_LEVELS + upperCapped) * 4 + (yachtFifty ? 2 : 0) + (lowerAlive ? 1 : 0)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/valueTable.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/engine/valueTable.ts src/engine/valueTable.test.ts
git commit -m "feat(engine): getVAdditional 접근자 (#40)"
```

---

## Task 5: 프리셋별 테이블 빌더 + V.additional.bin 생성

**Files:**
- Modify: `src/precompute/buildValueTable.ts`
- Modify: `package.json`
- Create: `public/V.additional.bin` (산출물)

**Interfaces:**
- Consumes: `buildOptimalLeafAdditional`, `STATE_COUNT_ADDITIONAL`, `packStateAdditional`, `YACHT_BIT`, `LOWER_FOUR_BITS`, `ADDITIONAL_RULES`.

- [ ] **Step 1: Refactor `buildValueTable.ts` to parameterize by preset**

Replace the entire file with (default path은 기존 로직 그대로 `buildDefault`로 보존):

```ts
// 오프라인 사전계산(Node). between-turns 가치함수 V 를 후방귀납으로 풀어 저장.
//   기본: public/V.bin  (mask×upper, 262144)
//   추가: public/V.additional.bin (mask×upper×yf×la, 1,048,576)
// CLI: `tsx src/precompute/buildValueTable.ts [default|additional]` (기본 default).

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ALL_HANDS } from '../core/dice';
import { ADDITIONAL_RULES, DEFAULT_RULES, MAX_REROLLS } from '../core/rules';
import { buildScoreTable } from '../core/scoring';
import {
  FILLED_COUNT,
  LOWER_FOUR_BITS,
  STATE_COUNT,
  STATE_COUNT_ADDITIONAL,
  UPPER_LEVELS,
  YACHT_BIT,
  packState,
  packStateAdditional,
} from '../core/stateIndex';
import { buildOptimalLeaf, buildOptimalLeafAdditional } from '../engine/optimalLeaf';
import { solveLayers, turnStartValue } from '../engine/withinTurnDP';

function popcount(n: number): number {
  let c = 0;
  while (n) {
    n &= n - 1;
    c++;
  }
  return c;
}

function masksByPopcount(): number[][] {
  const byPopcount: number[][] = Array.from({ length: 13 }, () => []);
  for (let mask = 0; mask < FILLED_COUNT; mask++) byPopcount[popcount(mask)].push(mask);
  return byPopcount;
}

function buildDefault() {
  const rules = DEFAULT_RULES;
  const t0 = Date.now();
  const scoreTable = buildScoreTable(ALL_HANDS, rules);
  const V = new Float32Array(STATE_COUNT);
  const byPopcount = masksByPopcount();
  for (let pc = 11; pc >= 0; pc--) {
    for (const mask of byPopcount[pc]) {
      for (let upper = 0; upper < UPPER_LEVELS; upper++) {
        const leaf = buildOptimalLeaf(scoreTable, V, mask, upper, rules);
        const layers = solveLayers(leaf, MAX_REROLLS);
        V[packState(mask, upper)] = turnStartValue(layers[MAX_REROLLS]);
      }
    }
    process.stdout.write(
      `\r  popcount ${pc} 완료 (${byPopcount[pc].length} masks)  경과 ${((Date.now() - t0) / 1000).toFixed(1)}s   `,
    );
  }
  process.stdout.write('\n');
  const optimalAverage = V[packState(0, 0)];
  writeTable('V.bin', V);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  states=${STATE_COUNT}, size=${(V.byteLength / 1e6).toFixed(2)}MB, time=${secs}s`);
  console.log(`  최적 기대 평균 점수(빈 카드에서) = ${optimalAverage.toFixed(3)}`);
}

function buildAdditional() {
  const rules = ADDITIONAL_RULES;
  const t0 = Date.now();
  const scoreTable = buildScoreTable(ALL_HANDS, rules);
  const V = new Float32Array(STATE_COUNT_ADDITIONAL); // 도달불가 조합은 0으로 남음(참조 안 됨)
  const byPopcount = masksByPopcount();
  for (let pc = 11; pc >= 0; pc--) {
    for (const mask of byPopcount[pc]) {
      const yfOpts = (mask & YACHT_BIT) !== 0 ? [false, true] : [false];
      const laOpts = (mask & LOWER_FOUR_BITS) !== 0 ? [false, true] : [true];
      for (let upper = 0; upper < UPPER_LEVELS; upper++) {
        for (const yf of yfOpts) {
          for (const la of laOpts) {
            const leaf = buildOptimalLeafAdditional(scoreTable, V, mask, upper, yf, la, rules);
            const layers = solveLayers(leaf, MAX_REROLLS);
            V[packStateAdditional(mask, upper, yf, la)] = turnStartValue(layers[MAX_REROLLS]);
          }
        }
      }
    }
    process.stdout.write(
      `\r  [additional] popcount ${pc} 완료 (${byPopcount[pc].length} masks)  경과 ${((Date.now() - t0) / 1000).toFixed(1)}s   `,
    );
  }
  process.stdout.write('\n');
  const optimalAverage = V[packStateAdditional(0, 0, false, true)];
  writeTable('V.additional.bin', V);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `  states=${STATE_COUNT_ADDITIONAL}, size=${(V.byteLength / 1e6).toFixed(2)}MB, time=${secs}s`,
  );
  console.log(`  [additional] 최적 기대 평균 점수(빈 카드에서) = ${optimalAverage.toFixed(3)}`);
}

function writeTable(name: string, V: Float32Array) {
  const outDir = resolve(process.cwd(), 'public');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, name);
  writeFileSync(outPath, Buffer.from(V.buffer, 0, V.byteLength));
  console.log(`${name} 저장: ${outPath}`);
}

function main() {
  const preset = process.argv[2] === 'additional' ? 'additional' : 'default';
  if (preset === 'additional') buildAdditional();
  else buildDefault();
}

main();
```

- [ ] **Step 2: Verify the default table is byte-identical (regression guard)**

```bash
cp public/V.bin /tmp/V.before.bin
npm run build:table
cmp public/V.bin /tmp/V.before.bin && echo "V.bin UNCHANGED"
```
Expected: prints `V.bin UNCHANGED` (the default path must be unchanged). If `cmp` reports a difference, the refactor altered default behavior — fix before continuing.

- [ ] **Step 3: Add the additional build scripts to `package.json`**

Change the `scripts` block lines:
```json
    "build:table": "tsx src/precompute/buildValueTable.ts",
    "prebuild": "npm run build:table",
```
to:
```json
    "build:table": "tsx src/precompute/buildValueTable.ts",
    "build:table:additional": "tsx src/precompute/buildValueTable.ts additional",
    "prebuild": "npm run build:table && npm run build:table:additional",
```

- [ ] **Step 4: Generate the additional table and record metrics**

```bash
npm run build:table:additional
ls -l public/V.additional.bin
```
Expected: prints the build time, `size≈4.19MB`, `states=1048576`, and `[additional] 최적 기대 평균 점수(빈 카드에서) = <baseline>` (must be > 191.8). `ls` shows `4194304` bytes. **Record the baseline number and build time in the PR description** (이슈 완료조건: 빌드 시간/용량 측정).

- [ ] **Step 5: Commit (code + generated table)**

```bash
git add src/precompute/buildValueTable.ts package.json public/V.additional.bin
git commit -m "feat(precompute): 프리셋별 V.bin 빌드 + V.additional.bin 생성 (#40)"
```

---

## Task 6: 추가 룰 시뮬레이션 정책 + 수렴 테스트

**Files:**
- Modify: `src/engine/simulate.ts`
- Test: `src/engine/additionalSolver.test.ts` (create)

**Interfaces:**
- Consumes: `buildOptimalLeafAdditional`, `scoreNowChoiceForHandAdditional`, `yachtFiftyOf`, `lowerAliveOf`, `recordMasterYachtBonus`, `getVAdditional` (for the test).
- Produces: `createPolicy`/`simulateMany` now route additional rulesets through `playOneGameAdditional` (same public signatures).

- [ ] **Step 1: Write the failing test**

Create `src/engine/additionalSolver.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDITIONAL_RULES } from '../core/rules';
import { STATE_COUNT_ADDITIONAL } from '../core/stateIndex';
import { getVAdditional } from './valueTable';
import type { ValueTable } from './valueTable';
import { simulateMany } from './simulate';

function loadVAdditional(): ValueTable {
  const buf = readFileSync(resolve(process.cwd(), 'public', 'V.additional.bin'));
  const table = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  if (table.length !== STATE_COUNT_ADDITIONAL) {
    throw new Error(`V.additional.bin 크기 불일치: ${table.length} (npm run build:table:additional)`);
  }
  return table;
}

describe('추가 룰 솔버 정합성 (V.additional.bin 필요)', () => {
  const V = loadVAdditional();
  const optimalAvg = getVAdditional(V, 0, 0, false, true);

  it('빈 카드 최적 기대값이 기본 룰(≈191.8)보다 높고 합리 범위', () => {
    expect(optimalAvg).toBeGreaterThan(195);
    expect(optimalAvg).toBeLessThan(300);
  });

  it('최적 정책 시뮬 평균 ≈ 테이블 예측값', () => {
    const stats = simulateMany(V, ADDITIONAL_RULES, 3000, 12345);
    expect(Math.abs(stats.mean - optimalAvg)).toBeLessThan(5);
    expect(stats.std).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/additionalSolver.test.ts`
Expected: FAIL — convergence fails (simulate still uses the default leaf/scoring, ignoring windfall/+50/+100), so `stats.mean` ≪ `optimalAvg`.

- [ ] **Step 3: Add the additional policy to `simulate.ts`**

Change the imports at top from:
```ts
import { ALL_HANDS, ALL_KEEPS, diceToCounts, handIndexOfDice, keepSizes } from '../core/dice';
import type { Scorecard } from '../core/gameState';
import {
  cappedUpperOf,
  createScorecard,
  filledMaskOf,
  grandTotal,
  recordScore,
} from '../core/gameState';
import type { RuleConfig } from '../core/rules';
import { CATEGORY_IDS, MAX_REROLLS, NUM_CATEGORIES } from '../core/rules';
import { buildScoreTable, scoreCounts } from '../core/scoring';
import { buildOptimalLeaf, scoreNowChoiceForHand } from './optimalLeaf';
import type { ValueTable } from './valueTable';
import { bestKeep, solveLayers } from './withinTurnDP';
```
to:
```ts
import { ALL_HANDS, ALL_KEEPS, diceToCounts, handIndexOfDice, keepSizes } from '../core/dice';
import type { Scorecard } from '../core/gameState';
import {
  cappedUpperOf,
  createScorecard,
  filledMaskOf,
  grandTotal,
  lowerAliveOf,
  recordMasterYachtBonus,
  recordScore,
  yachtFiftyOf,
} from '../core/gameState';
import type { RuleConfig } from '../core/rules';
import { CATEGORY_IDS, MAX_REROLLS, NUM_CATEGORIES } from '../core/rules';
import { buildScoreTable, scoreCounts } from '../core/scoring';
import {
  buildOptimalLeaf,
  buildOptimalLeafAdditional,
  scoreNowChoiceForHand,
  scoreNowChoiceForHandAdditional,
} from './optimalLeaf';
import type { ValueTable } from './valueTable';
import { bestKeep, solveLayers } from './withinTurnDP';
```

Then replace the `createPolicy` function (keep the default `playOneGame` body unchanged; add an additional branch):

```ts
export function createPolicy(V: ValueTable, rules: RuleConfig): Policy {
  const scoreTable = buildScoreTable(ALL_HANDS, rules);
  const additional = rules.multiYachtBonus || rules.lowerFourBonus;

  function playOneGameDefault(rng: RNG): { total: number; card: Scorecard } {
    let card = createScorecard();
    for (let turn = 0; turn < NUM_CATEGORIES; turn++) {
      let dice = [rollDie(rng), rollDie(rng), rollDie(rng), rollDie(rng), rollDie(rng)];
      for (let r = MAX_REROLLS; ; r--) {
        const handIndex = handIndexOfDice(dice);
        const filledMask = filledMaskOf(card);
        const cappedUpper = cappedUpperOf(card);
        const leaf = buildOptimalLeaf(scoreTable, V, filledMask, cappedUpper, rules);
        if (r > 0) {
          const layers = solveLayers(leaf, r);
          const bk = bestKeep(layers[r - 1], handIndex);
          if (keepSizes[bk.keepIndex] !== 5) {
            const remaining = ALL_KEEPS[bk.keepIndex].slice();
            dice = dice.map((d) => {
              if (remaining[d] > 0) {
                remaining[d]--;
                return d;
              }
              return rollDie(rng);
            });
            continue;
          }
        }
        const choice = scoreNowChoiceForHand(scoreTable, V, filledMask, cappedUpper, rules, handIndex);
        const cat = CATEGORY_IDS[choice.categoryIndex];
        card = recordScore(card, cat, scoreCounts(cat, diceToCounts(dice), rules));
        break;
      }
    }
    return { total: grandTotal(card, rules), card };
  }

  function playOneGameAdditional(rng: RNG): { total: number; card: Scorecard } {
    let card = createScorecard();
    for (let turn = 0; turn < NUM_CATEGORIES; turn++) {
      let dice = [rollDie(rng), rollDie(rng), rollDie(rng), rollDie(rng), rollDie(rng)];
      for (let r = MAX_REROLLS; ; r--) {
        const handIndex = handIndexOfDice(dice);
        const filledMask = filledMaskOf(card);
        const cappedUpper = cappedUpperOf(card);
        const yf = yachtFiftyOf(card, rules);
        const la = lowerAliveOf(card, rules);
        const leaf = buildOptimalLeafAdditional(scoreTable, V, filledMask, cappedUpper, yf, la, rules);
        if (r > 0) {
          const layers = solveLayers(leaf, r);
          const bk = bestKeep(layers[r - 1], handIndex);
          if (keepSizes[bk.keepIndex] !== 5) {
            const remaining = ALL_KEEPS[bk.keepIndex].slice();
            dice = dice.map((d) => {
              if (remaining[d] > 0) {
                remaining[d]--;
                return d;
              }
              return rollDie(rng);
            });
            continue;
          }
        }
        const choice = scoreNowChoiceForHandAdditional(
          scoreTable, V, filledMask, cappedUpper, yf, la, rules, handIndex,
        );
        const cat = CATEGORY_IDS[choice.categoryIndex];
        card = choice.isWindfall
          ? recordMasterYachtBonus(card, cat)
          : recordScore(card, cat, scoreCounts(cat, diceToCounts(dice), rules));
        break;
      }
    }
    return { total: grandTotal(card, rules), card };
  }

  return { playOneGame: additional ? playOneGameAdditional : playOneGameDefault };
}
```

- [ ] **Step 4: Run the additional + default solver tests**

Run: `npx vitest run src/engine/additionalSolver.test.ts src/engine/solver.test.ts`
Expected: PASS — additional converges (`|mean - optimalAvg| < 5`) and default solver.test still passes (≈191.8 unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/engine/simulate.ts src/engine/additionalSolver.test.ts
git commit -m "feat(engine): 추가 룰 시뮬 정책 + 수렴 베이스라인 테스트 (#40)"
```

---

## Task 7: PR1 전체 검증 + 회귀 확인

- [ ] **Step 1: Typecheck + full test suite**

```bash
npm run typecheck
npm test
```
Expected: typecheck clean; all tests pass (기존 + 신규). 특히 `solver.test.ts`(≈191.8)·`probability.test.ts` 무영향.

- [ ] **Step 2: Confirm default V.bin untouched in git**

```bash
git status --porcelain public/V.bin
```
Expected: empty output (V.bin not modified by PR1).

- [ ] **Step 3: Open PR1**

```bash
git push -u origin HEAD
gh pr create --title "추가 룰 헬퍼 엔진/테이블 (#40, 1/2)" --body "$(cat <<'EOF'
## 요약 (#40 1/2 — 엔진/테이블, 헬퍼는 아직 off)
- 상태공간 2비트 확장(yachtFifty·lowerAlive), naive ×4 패킹 `V.additional.bin`(4.00MiB, 1,048,576 states)
- 윈드폴 강제 leaf + 하단4종 +50 적립 leaf 빌더
- 프리셋별 빌더(`build:table:additional`), additional 시뮬 정책 + 수렴 테스트
- 추가 룰 베이스라인: <build 출력값 기입> / 빌드 시간: <기입>
- 기본 V.bin·≈191.8 무영향(cmp 확인), 헬퍼 게이팅은 PR2에서 켬

Refs #40
EOF
)"
```
(머지는 사용자 확인 후. 메모리: PR 생성 가능, 머지는 확인 후.)

---

# PR 2 — 연결 / UI (헬퍼 ON)

> PR2는 PR1 머지 후 시작. 같은 브랜치 흐름.

## Task 8: 프리셋별 길이 검증 로더 (`valueTable.ts`)

**Files:**
- Modify: `src/engine/valueTable.ts`

**Interfaces:**
- Produces: `loadValueTable(url: string, expectedLength?: number): Promise<ValueTable>` (default `expectedLength = STATE_COUNT`, 하위호환).

- [ ] **Step 1: Parameterize the length check**

Replace `loadValueTable` in `valueTable.ts`:

```ts
/** 바이너리 자산에서 V 로드. 길이 검증 포함(프리셋별 상태수). */
export async function loadValueTable(
  url: string,
  expectedLength: number = STATE_COUNT,
): Promise<ValueTable> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load value table: ${res.status} ${url}`);
  const buf = await res.arrayBuffer();
  const table = new Float32Array(buf);
  if (table.length !== expectedLength) {
    throw new Error(`value table size mismatch: got ${table.length}, expected ${expectedLength}`);
  }
  return table;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean (default callers pass no second arg → unchanged behavior).

- [ ] **Step 3: Commit**

```bash
git add src/engine/valueTable.ts
git commit -m "feat(engine): loadValueTable 길이 파라미터화 (#40)"
```

---

## Task 9: advisor 추가 룰 분기 + 윈드폴 필드 (`advisor.ts`)

**Files:**
- Modify: `src/engine/advisor.ts`
- Test: `src/engine/advisorAdditional.test.ts` (create)

**Interfaces:**
- Consumes: `buildOptimalLeafAdditional`, `scoreNowChoiceForHandAdditional`, `yachtFiftyOf`, `lowerAliveOf`.
- Produces: `Advice.windfall?: { active: boolean; bonus: number; category: CategoryId }`. `createAdvisor(V, rules)` auto-routes additional rulesets.

- [ ] **Step 1: Write the failing test**

Create `src/engine/advisorAdditional.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDITIONAL_RULES } from '../core/rules';
import { STATE_COUNT_ADDITIONAL } from '../core/stateIndex';
import { createScorecard, recordScore } from '../core/gameState';
import { createAdvisor } from './advisor';
import type { ValueTable } from './valueTable';

function loadVAdditional(): ValueTable {
  const buf = readFileSync(resolve(process.cwd(), 'public', 'V.additional.bin'));
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

describe('advisor 추가 룰', () => {
  const advisor = createAdvisor(loadVAdditional(), ADDITIONAL_RULES);

  it('테이블 길이가 추가 룰 상태수', () => {
    expect(loadVAdditional().length).toBe(STATE_COUNT_ADDITIONAL);
  });

  it('요트50 기록 + 5개 같은 눈 → 윈드폴 추천', () => {
    const card = recordScore(createScorecard(), 'yacht', 50);
    const advice = advisor.advise(card, [3, 3, 3, 3, 3], 0);
    expect(advice.windfall?.active).toBe(true);
    expect(advice.windfall?.bonus).toBe(100);
    expect(advice.recommendScoreNow).toBe(true);
  });

  it('일반 상황 → 윈드폴 비활성', () => {
    const advice = advisor.advise(createScorecard(), [1, 2, 3, 4, 6], 0);
    expect(advice.windfall?.active ?? false).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/advisorAdditional.test.ts`
Expected: FAIL — `advice.windfall` is undefined (advisor doesn't handle additional).

- [ ] **Step 3: Add the additional advise path to `advisor.ts`**

Update imports — change:
```ts
import type { CategoryId, RuleConfig } from '../core/rules';
import { CATEGORY_IDS, NUM_CATEGORIES } from '../core/rules';
import type { Scorecard } from '../core/gameState';
import {
  cappedUpperOf,
  filledMaskOf,
  grandTotal,
  isCategoryFilled,
} from '../core/gameState';
import { buildScoreTable } from '../core/scoring';
import type { ValueTable } from './valueTable';
import { buildOptimalLeaf, scoreNowChoiceForHand } from './optimalLeaf';
```
to:
```ts
import type { CategoryId, RuleConfig } from '../core/rules';
import { CATEGORY_IDS, NUM_CATEGORIES } from '../core/rules';
import type { Scorecard } from '../core/gameState';
import {
  cappedUpperOf,
  filledMaskOf,
  grandTotal,
  isCategoryFilled,
  lowerAliveOf,
  yachtFiftyOf,
} from '../core/gameState';
import { buildScoreTable } from '../core/scoring';
import type { ValueTable } from './valueTable';
import {
  buildOptimalLeaf,
  buildOptimalLeafAdditional,
  scoreNowChoiceForHand,
  scoreNowChoiceForHandAdditional,
} from './optimalLeaf';
```

Add the `windfall` field to the `Advice` interface (after `comboProbs`):
```ts
  comboProbs: ComboProbInfo[];
  /** 요트의 달인 윈드폴 추천(추가 룰). 기본 룰에선 undefined. */
  windfall?: { active: boolean; bonus: number; category: CategoryId };
}
```

In `createAdvisor`, after `const columnLeaf = ...` block, branch the returned `advise`. Replace the existing `function advise(...) { ... } return { advise };` tail with a preset switch — keep the existing default body as `adviseDefault`, add `adviseAdditional`:

```ts
  const additional = rules.multiYachtBonus || rules.lowerFourBonus;

  function adviseDefault(card: Scorecard, dice: readonly number[], rerollsLeft: number): Advice {
    // ── 기존 advise 본문을 그대로 둔다(변경 없음) ──
    const handIndex = handIndexOfDice(dice);
    const filledMask = filledMaskOf(card);
    const cappedUpper = cappedUpperOf(card);
    const alreadyTotal = grandTotal(card, rules);
    const leaf = buildOptimalLeaf(scoreTable, V, filledMask, cappedUpper, rules);
    const scoreNow = scoreNowChoiceForHand(scoreTable, V, filledMask, cappedUpper, rules, handIndex);
    let recommendScoreNow: boolean;
    let holdMask: boolean[];
    let valueAtCurrent: number;
    let evGainFromReroll: number;
    if (rerollsLeft > 0) {
      const layers = solveLayers(leaf, rerollsLeft);
      valueAtCurrent = layers[rerollsLeft][handIndex];
      const bk = bestKeep(layers[rerollsLeft - 1], handIndex);
      recommendScoreNow = keepSizes[bk.keepIndex] === 5;
      holdMask = keepToHoldMask(ALL_KEEPS[bk.keepIndex], dice);
      evGainFromReroll = valueAtCurrent - leaf[handIndex];
      if (evGainFromReroll < 0) evGainFromReroll = 0;
    } else {
      valueAtCurrent = leaf[handIndex];
      recommendScoreNow = true;
      holdMask = dice.map(() => true);
      evGainFromReroll = 0;
    }
    const perCategory = buildPerCategory(card, handIndex, rerollsLeft);
    const comboProbs = buildComboProbs(handIndex, rerollsLeft);
    return {
      rerollsLeft,
      recommendScoreNow,
      holdMask,
      bestCategory: CATEGORY_IDS[scoreNow.categoryIndex],
      bestCategoryScoreNow: scoreNow.rawScore,
      expectedFinalScore: alreadyTotal + valueAtCurrent,
      evGainFromReroll,
      perCategory,
      comboProbs,
    };
  }

  function adviseAdditional(card: Scorecard, dice: readonly number[], rerollsLeft: number): Advice {
    const handIndex = handIndexOfDice(dice);
    const filledMask = filledMaskOf(card);
    const cappedUpper = cappedUpperOf(card);
    const yf = yachtFiftyOf(card, rules);
    const la = lowerAliveOf(card, rules);
    const alreadyTotal = grandTotal(card, rules);
    const leaf = buildOptimalLeafAdditional(scoreTable, V, filledMask, cappedUpper, yf, la, rules);
    const scoreNow = scoreNowChoiceForHandAdditional(
      scoreTable, V, filledMask, cappedUpper, yf, la, rules, handIndex,
    );
    let recommendScoreNow: boolean;
    let holdMask: boolean[];
    let valueAtCurrent: number;
    let evGainFromReroll: number;
    if (rerollsLeft > 0) {
      const layers = solveLayers(leaf, rerollsLeft);
      valueAtCurrent = layers[rerollsLeft][handIndex];
      const bk = bestKeep(layers[rerollsLeft - 1], handIndex);
      recommendScoreNow = keepSizes[bk.keepIndex] === 5;
      holdMask = keepToHoldMask(ALL_KEEPS[bk.keepIndex], dice);
      evGainFromReroll = valueAtCurrent - leaf[handIndex];
      if (evGainFromReroll < 0) evGainFromReroll = 0;
    } else {
      valueAtCurrent = leaf[handIndex];
      recommendScoreNow = true;
      holdMask = dice.map(() => true);
      evGainFromReroll = 0;
    }
    const perCategory = buildPerCategory(card, handIndex, rerollsLeft);
    const comboProbs = buildComboProbs(handIndex, rerollsLeft);
    return {
      rerollsLeft,
      recommendScoreNow,
      holdMask,
      bestCategory: CATEGORY_IDS[scoreNow.categoryIndex],
      bestCategoryScoreNow: scoreNow.rawScore,
      expectedFinalScore: alreadyTotal + valueAtCurrent,
      evGainFromReroll,
      perCategory,
      comboProbs,
      windfall: {
        active: scoreNow.isWindfall,
        bonus: rules.multiYachtBonusAmount,
        category: CATEGORY_IDS[scoreNow.categoryIndex],
      },
    };
  }

  return { advise: additional ? adviseAdditional : adviseDefault };
```

Extract the two shared blocks (per-category EV, combo probs) into helpers inside `createAdvisor` (above the advise functions) so both paths reuse them DRY:

```ts
  function buildPerCategory(
    card: Scorecard,
    handIndex: number,
    rerollsLeft: number,
  ): PerCategoryAdvice[] {
    return CATEGORY_IDS.map((category, c) => {
      const filled = isCategoryFilled(card, category);
      const sNow = scoreTable[handIndex * NUM_CATEGORIES + c];
      let evIfReroll = sNow;
      if (rerollsLeft > 0) {
        const layers = solveLayers(columnLeaf[c], rerollsLeft);
        evIfReroll = layers[rerollsLeft][handIndex];
      }
      return { category, filled, scoreNow: sNow, evIfReroll, delta: evIfReroll - sNow };
    });
  }

  function buildComboProbs(handIndex: number, rerollsLeft: number): ComboProbInfo[] {
    return COMBO_IDS.map((combo) => ({
      combo,
      label: COMBO_LABEL[combo],
      prob: comboProbability(combo, handIndex, rerollsLeft),
    }));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/advisorAdditional.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/advisor.ts src/engine/advisorAdditional.test.ts
git commit -m "feat(engine): advisor 추가 룰 분기 + 윈드폴 필드 (#40)"
```

---

## Task 10: 프리셋별 테이블 로드 + advisor 일치 가드 (`gameStore.ts`)

**Files:**
- Modify: `src/store/gameStore.ts`

**Interfaces:**
- Produces: store field `advisorPreset: RulePresetId | null`. `loadTable()` picks file/length/advisor by `rulePreset`. `setRulePreset` resets table state so the new preset reloads.

- [ ] **Step 1: Add imports + `advisorPreset` field**

Change the import lines:
```ts
import { DEFAULT_PRESET_ID, DICE_COUNT, ROLLS_PER_TURN, RULE_PRESETS } from '../core/rules';
```
→ add `STATE_COUNT`, `STATE_COUNT_ADDITIONAL`:
```ts
import { DEFAULT_PRESET_ID, DICE_COUNT, ROLLS_PER_TURN, RULE_PRESETS } from '../core/rules';
import { STATE_COUNT, STATE_COUNT_ADDITIONAL } from '../core/stateIndex';
```

In the `GameStore` interface, after `advisor: Advisor | null;` add:
```ts
  /** 현재 로드된 advisor 가 어느 프리셋용인지(보드 프리셋과 불일치 시 조언 미사용). */
  advisorPreset: RulePresetId | null;
```

In the store initializer, after `advisor: null,` add:
```ts
  advisorPreset: null,
```

- [ ] **Step 2: Rewrite `loadTable` to be preset-aware**

Replace the `loadTable` implementation:
```ts
  loadTable: async () => {
    if (!RULE_PRESETS[get().rulePreset].helperSupported) return;
    if (get().tableStatus === 'loading' || get().tableStatus === 'ready') return;
    set({ tableStatus: 'loading' });
    try {
      const V = await loadValueTable(`${import.meta.env.BASE_URL}V.bin`);
      const advisor = createAdvisor(V, get().rules);
      set({ advisor, tableStatus: 'ready' });
    } catch (e) {
      console.error(e);
      set({ tableStatus: 'error' });
    }
  },
```
with:
```ts
  loadTable: async () => {
    const preset = get().rulePreset;
    if (!RULE_PRESETS[preset].helperSupported) return;
    if (get().tableStatus === 'loading' || get().tableStatus === 'ready') return;
    set({ tableStatus: 'loading' });
    try {
      const additional = preset === 'additional';
      const file = additional ? 'V.additional.bin' : 'V.bin';
      const expected = additional ? STATE_COUNT_ADDITIONAL : STATE_COUNT;
      const V = await loadValueTable(`${import.meta.env.BASE_URL}${file}`, expected);
      const advisor = createAdvisor(V, get().rules);
      set({ advisor, advisorPreset: preset, tableStatus: 'ready' });
    } catch (e) {
      console.error(e);
      set({ tableStatus: 'error' });
    }
  },
```

- [ ] **Step 3: Reset table state on preset change**

In `setRulePreset`, change the `set({ ... })` block to reset advisor/table and stop force-disabling the helper (additional now supported). Replace:
```ts
      undoUsedThisGame: false,
      scoreSubmittedThisGame: false,
      // 헬퍼 미지원 프리셋에서는 헬퍼를 강제로 끈다(설정 토글·게이팅 일치).
      settings: preset.helperSupported
        ? get().settings
        : { ...get().settings, helperEnabled: false },
    });
```
with:
```ts
      undoUsedThisGame: false,
      scoreSubmittedThisGame: false,
      // 프리셋이 바뀌면 이전 테이블/advisor 는 무효 → 리셋해 새 프리셋용으로 다시 로드.
      advisor: null,
      advisorPreset: null,
      tableStatus: 'idle',
      // 헬퍼 미지원 프리셋이면 토글을 끈다(현재는 둘 다 지원이라 사실상 그대로 유지).
      settings: preset.helperSupported
        ? get().settings
        : { ...get().settings, helperEnabled: false },
    });
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/store/gameStore.ts
git commit -m "feat(store): 프리셋별 V.bin 로드 + advisorPreset 가드 (#40)"
```

---

## Task 11: 보드에 프리셋 노출 + advisor 일치 가드 (`useBoard.ts`, `useAdvice.ts`)

**Files:**
- Modify: `src/store/useBoard.ts`
- Modify: `src/store/useAdvice.ts`

**Interfaces:**
- Produces: `BoardView.rulePreset: RulePresetId`. `useAdvice` returns null when `advisorPreset !== board.rulePreset` (보드↔테이블 불일치 시 잘못된 조언 방지; MP 안전).

- [ ] **Step 1: Add `rulePreset` to `BoardView` + both return objects**

In `useBoard.ts`, add `RulePresetId` to the type import:
```ts
import type { CategoryId, RuleConfig } from '../core/rules';
```
→
```ts
import type { CategoryId, RuleConfig, RulePresetId } from '../core/rules';
```

Add to the `BoardView` interface (after `rules: RuleConfig;`):
```ts
  /** 현재 보드의 룰 프리셋(헬퍼 테이블 일치 확인용). */
  rulePreset: RulePresetId;
```

In the multiplayer return object add:
```ts
      rules: mpRules,
      rulePreset: mpRoom.rulePreset,
```
In the solo return object add:
```ts
      rules: soloRules,
      rulePreset: soloRulePreset,
```

- [ ] **Step 2: Guard `useAdvice` on preset match**

In `useAdvice.ts`, read `advisorPreset` and `rulePreset`, add the guard:
```ts
export function useAdvice(): Advice | null {
  const advisor = useGameStore((s) => s.advisor);
  const advisorPreset = useGameStore((s) => s.advisorPreset);
  const board = useBoard();
  const { helperEnabled, tableStatus, rollsUsed, gameOver, card, dice, rulePreset } = board;

  return useMemo(() => {
    if (!helperEnabled || tableStatus !== 'ready' || !advisor) return null;
    if (advisorPreset !== rulePreset) return null; // 로드된 테이블이 보드 프리셋과 다르면 미사용
    if (rollsUsed === 0 || gameOver || isGameOver(card)) return null;
    return advisor.advise(card, dice, ROLLS_PER_TURN - rollsUsed);
  }, [advisor, advisorPreset, rulePreset, tableStatus, helperEnabled, rollsUsed, gameOver, card, dice]);
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/store/useBoard.ts src/store/useAdvice.ts
git commit -m "feat(store): 보드 프리셋 노출 + advisor 일치 가드 (#40)"
```

---

## Task 12: 솔로 prefetch를 프리셋 의존으로 (`App.tsx`)

**Files:**
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Re-fetch the table when the solo preset changes**

Replace the prefetch effect:
```ts
  // 헬퍼 데이터는 백그라운드로 미리 받아둔다(토글 시 즉시 동작). 추가 룰에서는 건너뛴다.
  useEffect(() => {
    if (helperSupported) void loadTable();
  }, [loadTable, helperSupported]);
```
with:
```ts
  // 헬퍼 데이터는 백그라운드로 미리 받아둔다(토글 시 즉시 동작). 프리셋이 바뀌면 다시 로드.
  useEffect(() => {
    if (helperSupported) void loadTable();
  }, [loadTable, helperSupported, rulePreset]);
```
(`rulePreset` 변수는 이미 line 16에 선언되어 있음. `setRulePreset`이 `tableStatus`를 `idle`로 리셋하므로 `loadTable`이 새 프리셋용으로 진행됨.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/App.tsx
git commit -m "feat(ui): 프리셋 변경 시 헬퍼 테이블 재로드 (#40)"
```

---

## Task 13: 윈드폴 추천 배너 (`HelperPanel.tsx`)

**Files:**
- Modify: `src/ui/HelperPanel.tsx`

- [ ] **Step 1: Show a windfall banner when active**

In `HelperPanel.tsx`, inside the `else` branch (where `advice` is non-null), replace the `body = (` opening and the score/reroll banner with a windfall-aware version. Replace:
```tsx
    const keptValues = dice.filter((_, i) => advice.holdMask[i]);
    const bestKo = CATEGORY_META[advice.bestCategory].ko;

    body = (
      <>
        {advice.recommendScoreNow ? (
          <div className="banner score">
            <span className="icon">✅</span>
            <span className="text">
              <span className="main">
                지금 <em>{bestKo}</em>에 기록
              </span>
              <span className="sub">현재 {advice.bestCategoryScoreNow}점</span>
            </span>
          </div>
        ) : (
```
with:
```tsx
    const keptValues = dice.filter((_, i) => advice.holdMask[i]);
    const bestKo = CATEGORY_META[advice.bestCategory].ko;
    const windfall = advice.windfall?.active ? advice.windfall : null;

    body = (
      <>
        {windfall ? (
          <div className="banner score windfall">
            <span className="icon">🎰</span>
            <span className="text">
              <span className="main">
                요트의 달인! <em>{bestKo}</em> 칸에 기록
              </span>
              <span className="sub">보너스 +{windfall.bonus}점</span>
            </span>
          </div>
        ) : advice.recommendScoreNow ? (
          <div className="banner score">
            <span className="icon">✅</span>
            <span className="text">
              <span className="main">
                지금 <em>{bestKo}</em>에 기록
              </span>
              <span className="sub">현재 {advice.bestCategoryScoreNow}점</span>
            </span>
          </div>
        ) : (
```

(The trailing `)` and reroll banner are unchanged. The `.windfall` CSS class is optional styling; reuses `.banner.score` layout if no extra CSS is added.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/HelperPanel.tsx
git commit -m "feat(ui): 요트의 달인 윈드폴 추천 배너 (#40)"
```

---

## Task 14: MP 토글 동작 보존 + 헬퍼 ON 플립 + precache 한도

**Files:**
- Modify: `src/ui/Home.tsx`
- Modify: `vite.config.ts`
- Modify: `src/core/rules.ts` (**마지막**)

**Interfaces:**
- Consumes: 서버 `create_room`이 additional 방 `helper_allowed=false` 강제(확인됨) → MP 동작 불변 유지.

- [ ] **Step 1: Keep the MP create-room helper toggle disabled for additional rooms**

`helperSupported`를 플립하면 Home의 MP 헬퍼 토글이 additional에서도 활성화되지만, 서버가 어차피 끈다.
MP 동작을 0 변경으로 유지하기 위해 Home에서 토글 게이트를 **서버 진실**(additional 방=헬퍼 불가)로 고정한다.
`Home.tsx`에서 변경:
```ts
  const helperSupported = RULE_PRESETS[rulePreset].helperSupported;
  // 추가 룰은 헬퍼 미지원 → 토글 강제 off.
  const helperOn = helperAllowed && helperSupported;
```
→
```ts
  // 멀티 추가 룰 방은 서버가 helper_allowed=false 를 강제(별도 이슈) → 토글은 기본 룰에서만.
  const mpHelperSelectable = rulePreset === 'default';
  const helperOn = helperAllowed && mpHelperSelectable;
```
그리고 토글 버튼과 안내문에서 `helperSupported` → `mpHelperSelectable`로 교체:
```tsx
                      aria-disabled={!helperSupported}
                      disabled={!helperSupported}
                      onClick={() => helperSupported && setHelperAllowed((v) => !v)}
                    />
                  </div>
                  {!helperSupported && (
                    <div className="mp-note">추가 룰에서는 헬퍼를 사용할 수 없습니다.</div>
                  )}
```
→
```tsx
                      aria-disabled={!mpHelperSelectable}
                      disabled={!mpHelperSelectable}
                      onClick={() => mpHelperSelectable && setHelperAllowed((v) => !v)}
                    />
                  </div>
                  {!mpHelperSelectable && (
                    <div className="mp-note">멀티 추가 룰 방에서는 헬퍼를 사용할 수 없습니다.</div>
                  )}
```

- [ ] **Step 2: Raise the PWA precache size limit**

`vite.config.ts`에서:
```ts
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
```
→
```ts
        // V.additional.bin(4.0MiB)까지 precache 허용. base 1MB + additional 4MB.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
```

- [ ] **Step 3: Flip `helperSupported` for the additional preset (engine ready)**

`src/core/rules.ts`에서:
```ts
  additional: {
    id: 'additional',
    ko: '추가 룰',
    en: 'Extra',
    desc: '요트의 달인(반복 요트 +100)·요트도 포커처럼(하단 4종 완성 +50). 헬퍼 미지원.',
    config: ADDITIONAL_RULES,
    helperSupported: false,
  },
```
→
```ts
  additional: {
    id: 'additional',
    ko: '추가 룰',
    en: 'Extra',
    desc: '요트의 달인(반복 요트 +100)·요트도 포커처럼(하단 4종 완성 +50).',
    config: ADDITIONAL_RULES,
    helperSupported: true,
  },
```

- [ ] **Step 4: Fix the gating assertion test**

`src/core/additionalRules.test.ts`에서 `additional.helperSupported === false`를 단언하는 케이스(약 line 31)를 찾아 `true`로 갱신:
```ts
    expect(RULE_PRESETS.additional.helperSupported).toBe(false);
```
→
```ts
    expect(RULE_PRESETS.additional.helperSupported).toBe(true);
```

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: all pass (additionalRules.test 갱신 포함).

- [ ] **Step 6: Commit**

```bash
git add src/ui/Home.tsx vite.config.ts src/core/rules.ts src/core/additionalRules.test.ts
git commit -m "feat: 추가 룰 헬퍼 활성화 + precache 한도 상향, MP 동작 보존 (#40)"
```

---

## Task 15: PR2 통합 검증 (빌드·오프라인·UI)

- [ ] **Step 1: Full build (regenerates BOTH tables via prebuild)**

```bash
npm run build
```
Expected: `prebuild`가 `V.bin`·`V.additional.bin` 둘 다 생성 후 `tsc --noEmit && vite build` 성공. dist에 두 .bin 포함. **빌드 총 시간 기록**(이슈 완료조건).

- [ ] **Step 2: Confirm both tables are precached + total size**

```bash
ls -l dist/V.bin dist/V.additional.bin
grep -o '"V[^"]*\.bin"' dist/sw.js 2>/dev/null || grep -ro 'V.*\.bin' dist/*.js | head
```
Expected: `V.bin`(≈1MB)·`V.additional.bin`(≈4.19MB) 둘 다 존재하고 SW precache manifest에 포함. 총 precache가 8MB 한도 내인지 확인.

- [ ] **Step 3: Manual preview verification (solo additional helper)**

```bash
npm run preview
```
preview 도구로 확인:
- 설정에서 규칙 "추가 룰" 선택 → 헬퍼 토글 활성화·동작.
- 주사위 굴림 시 HelperPanel에 추천/예상점수 표시.
- 요트를 50으로 기록 후 5개 같은 눈 → HelperPanel에 "요트의 달인! … +100" 배너, 추천 칸 하이라이트.
- 콘솔/네트워크 오류 없음(`V.additional.bin` 200, 길이검증 통과).

검증 절차(preview_start → preview_snapshot/preview_console_logs → preview_screenshot)로 증거 수집.

- [ ] **Step 4: Open PR2**

```bash
git push
gh pr create --title "추가 룰 헬퍼 활성화 — 연결/UI (#40, 2/2)" --body "$(cat <<'EOF'
## 요약 (#40 2/2 — 헬퍼 ON)
- advisor 추가 룰 분기 + 윈드폴 추천 필드, 프리셋별 V.bin 로드(advisorPreset 가드)
- HelperPanel 윈드폴 배너, App preset 의존 prefetch
- `helperSupported: true`(additional), precache 한도 8MB 상향
- MP 동작 불변(서버가 additional 방 헬퍼 강제 off; Home 토글도 기본 룰 전용 유지)
- 검증: typecheck/test/build 통과, preview 오프라인·UI 확인(스크린샷 첨부)

Closes #40
EOF
)"
```

---

## Self-Review

**1. Spec coverage** (spec §6 손댈 곳 ↔ tasks):
- stateIndex 추가 패킹 → Task 1 ✔
- gameState 비트 도출 → Task 2 ✔
- optimalLeaf 윈드폴/+50 → Task 3 ✔
- valueTable getVAdditional/loader → Task 4(접근자)·Task 8(로더) ✔
- buildValueTable 프리셋화 + V.additional.bin → Task 5 ✔
- simulate additional + 수렴 테스트 → Task 6 ✔
- package.json scripts → Task 5 ✔
- advisor 분기 + Advice.windfall → Task 9 ✔
- gameStore 로드/리셋 → Task 10 ✔
- useBoard/useAdvice/App 연결 → Task 11·12 ✔
- HelperPanel 윈드폴 표시 → Task 13 ✔
- rules helperSupported 플립 → Task 14 ✔
- vite precache 한도 → Task 14 ✔
- 기본 V.bin·≈191.8 무영향 → Task 5 Step2(cmp)·Task 7 ✔
- 빌드 시간/용량 측정 → Task 5 Step4·Task 15 Step1-2 ✔
- 완료조건 4종(EV/카테고리EV/콤보, V.bin 로드·precache, 수렴 베이스라인, 기본 무영향) → 전반 커버 ✔

**2. Placeholder scan:** 모든 step에 실제 코드/명령/예상 출력 포함. "적절히 처리" 류 없음.

**3. Type consistency:**
- `packStateAdditional(mask,upper,yf,la)` 시그니처가 Task 1·5·4(getVAdditional 인덱스식)에서 일치.
- `buildOptimalLeafAdditional(scoreTable,V,mask,upper,yf,la,rules)` / `scoreNowChoiceForHandAdditional(...,handIndex)` — Task 3 정의 = Task 6·9 사용처 인자 순서 일치.
- `ScoreNowChoiceAdditional { categoryIndex, value, rawScore, isWindfall }` — Task 3 정의 = Task 6·9 사용 일치.
- `Advice.windfall?: { active, bonus, category }` — Task 9 정의 = Task 13 사용(`advice.windfall?.active`/`.bonus`) 일치.
- `yachtFiftyOf`/`lowerAliveOf` — Task 2 정의 = Task 6·9 사용 일치.
- `loadValueTable(url, expectedLength?)` — Task 8 정의 = Task 10 호출(2-arg) 일치.
- `advisorPreset`/`BoardView.rulePreset` — Task 10·11 정의 = Task 11 useAdvice 사용 일치.
