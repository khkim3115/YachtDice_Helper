// "지금 기록" 가치 계산 — 턴 내부 DP 의 0-리롤 leaf(게임 전체 최적용).
// leaf[h] = max over 빈 카테고리 c of ( 즉시보상(c,h) + V(다음상태) )
// 즉시보상 = 카테고리 점수 + (상단 63 돌파 시) 보너스.
// V 는 오직 여기(종단 카테고리 선택)에서만 등장 — 미래가치 이중계산 금지.

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

/** 비-종단 상태(빈 카테고리 ≥1)에 대한 leaf 전체(252) 계산. 핫패스라 인라인/무할당. */
export function buildOptimalLeaf(
  scoreTable: Float64Array,
  V: Float32Array | Float64Array,
  filledMask: number,
  cappedUpper: number,
  rules: RuleConfig,
): Float64Array {
  const leaf = new Float64Array(HAND_COUNT);
  const C = NUM_CATEGORIES;
  const threshold = rules.upperBonusThreshold;
  const amount = rules.upperBonusAmount;
  for (let h = 0; h < HAND_COUNT; h++) {
    const base = h * C;
    let best = -Infinity;
    for (let c = 0; c < C; c++) {
      if (filledMask & (1 << c)) continue;
      const raw = scoreTable[base + c];
      let cand: number;
      if (IS_UPPER[c]) {
        const sum = cappedUpper + raw;
        const nextUpper = sum > UPPER_CAP ? UPPER_CAP : sum;
        const bonus = cappedUpper < threshold && sum >= threshold ? amount : 0;
        cand = raw + bonus + V[(filledMask | (1 << c)) * UPPER_LEVELS + nextUpper];
      } else {
        cand = raw + V[(filledMask | (1 << c)) * UPPER_LEVELS + cappedUpper];
      }
      if (cand > best) best = cand;
    }
    leaf[h] = best;
  }
  return leaf;
}

export interface ScoreNowChoice {
  /** 최적 기록 카테고리 인덱스(0..11). */
  categoryIndex: number;
  /** 그 선택의 게임 전체 가치(즉시보상 + 미래 V). */
  value: number;
  /** 그 카테고리의 즉시 점수(보너스 제외). */
  rawScore: number;
}

/** 현재 손패 하나에 대해 "지금 기록 시" 최적 카테고리와 가치. */
export function scoreNowChoiceForHand(
  scoreTable: Float64Array,
  V: Float32Array | Float64Array,
  filledMask: number,
  cappedUpper: number,
  rules: RuleConfig,
  handIndex: number,
): ScoreNowChoice {
  const C = NUM_CATEGORIES;
  const threshold = rules.upperBonusThreshold;
  const amount = rules.upperBonusAmount;
  const base = handIndex * C;
  let bestC = -1;
  let bestVal = -Infinity;
  let bestRaw = 0;
  for (let c = 0; c < C; c++) {
    if (filledMask & (1 << c)) continue;
    const raw = scoreTable[base + c];
    let cand: number;
    if (IS_UPPER[c]) {
      const sum = cappedUpper + raw;
      const nextUpper = sum > UPPER_CAP ? UPPER_CAP : sum;
      const bonus = cappedUpper < threshold && sum >= threshold ? amount : 0;
      cand = raw + bonus + V[(filledMask | (1 << c)) * UPPER_LEVELS + nextUpper];
    } else {
      cand = raw + V[(filledMask | (1 << c)) * UPPER_LEVELS + cappedUpper];
    }
    if (cand > bestVal) {
      bestVal = cand;
      bestC = c;
      bestRaw = raw;
    }
  }
  return { categoryIndex: bestC, value: bestVal, rawScore: bestRaw };
}

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
