// "지금 기록" 가치 계산 — 턴 내부 DP 의 0-리롤 leaf(게임 전체 최적용).
// leaf[h] = max over 빈 카테고리 c of ( 즉시보상(c,h) + V(다음상태) )
// 즉시보상 = 카테고리 점수 + (상단 63 돌파 시) 보너스.
// V 는 오직 여기(종단 카테고리 선택)에서만 등장 — 미래가치 이중계산 금지.

import { HAND_COUNT } from '../core/dice';
import type { RuleConfig } from '../core/rules';
import { NUM_CATEGORIES } from '../core/rules';
import { IS_UPPER, UPPER_CAP, UPPER_LEVELS } from '../core/stateIndex';

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
