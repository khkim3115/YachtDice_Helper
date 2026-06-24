// 카테고리 채점. 카운트 벡터 기반(성능) + 주사위 배열 편의 함수.

import type { Counts } from './dice';
import { diceToCounts } from './dice';
import type { CategoryId, RuleConfig } from './rules';
import { CATEGORY_IDS } from './rules';

function sumAll(counts: Counts): number {
  let s = 0;
  for (let v = 1; v <= 6; v++) s += v * counts[v];
  return s;
}

function maxCountFace(counts: Counts): { max: number; face: number } {
  let max = 0;
  let face = 0;
  for (let v = 1; v <= 6; v++) {
    if (counts[v] > max) {
      max = counts[v];
      face = v;
    }
  }
  return { max, face };
}

function isFullHousePattern(counts: Counts, rules: RuleConfig): boolean {
  let has2 = false;
  let has3 = false;
  let has5 = false;
  for (let v = 1; v <= 6; v++) {
    if (counts[v] === 2) has2 = true;
    if (counts[v] === 3) has3 = true;
    if (counts[v] === 5) has5 = true;
  }
  if (has2 && has3) return true; // 서로 다른 두 눈의 3+2
  if (has5 && rules.fiveOfAKindCountsAsFullHouse) return true;
  return false;
}

function hasRun(counts: Counts, start: number, len: number): boolean {
  for (let v = start; v < start + len; v++) if (counts[v] === 0) return false;
  return true;
}

/** 카운트 벡터에 대한 카테고리 점수. */
export function scoreCounts(category: CategoryId, counts: Counts, rules: RuleConfig): number {
  switch (category) {
    case 'ones':
      return counts[1] * 1;
    case 'twos':
      return counts[2] * 2;
    case 'threes':
      return counts[3] * 3;
    case 'fours':
      return counts[4] * 4;
    case 'fives':
      return counts[5] * 5;
    case 'sixes':
      return counts[6] * 6;
    case 'choice':
      return sumAll(counts);
    case 'fourKind': {
      const { max, face } = maxCountFace(counts);
      if (max < 4) return 0;
      return rules.fourKindScore === 'sumAll' ? sumAll(counts) : 4 * face;
    }
    case 'fullHouse': {
      if (!isFullHousePattern(counts, rules)) return 0;
      return rules.fullHouseScore === 'fixed25' ? 25 : sumAll(counts);
    }
    case 'smallStraight': {
      const ok = hasRun(counts, 1, 4) || hasRun(counts, 2, 4) || hasRun(counts, 3, 4);
      return ok ? rules.smallStraightScore : 0;
    }
    case 'largeStraight': {
      const ok = hasRun(counts, 1, 5) || hasRun(counts, 2, 5);
      return ok ? rules.largeStraightScore : 0;
    }
    case 'yacht': {
      const { max } = maxCountFace(counts);
      return max === 5 ? rules.yachtScore : 0;
    }
  }
}

/** 주사위 배열 편의 버전. */
export function scoreDice(category: CategoryId, dice: readonly number[], rules: RuleConfig): number {
  return scoreCounts(category, diceToCounts(dice), rules);
}

/**
 * 5개가 모두 같은 눈인지(요트 패턴). 요트의 달인 발동 판정에 쓰인다.
 * 채점(yachtScore)과 무관하게 순수 패턴만 본다.
 */
export function isFiveOfAKind(dice: readonly number[]): boolean {
  const counts = diceToCounts(dice);
  for (let v = 1; v <= 6; v++) if (counts[v] === 5) return true;
  return false;
}

/**
 * 모든 손패(252) × 모든 카테고리(12)의 점수 테이블.
 * 사전계산과 런타임 솔버가 동일 채점을 쓰도록 공유한다.
 * 반환: Float64Array, 인덱스 = handIndex * 12 + categoryIndex.
 */
export function buildScoreTable(hands: Counts[], rules: RuleConfig): Float64Array {
  const n = hands.length;
  const table = new Float64Array(n * CATEGORY_IDS.length);
  for (let h = 0; h < n; h++) {
    for (let c = 0; c < CATEGORY_IDS.length; c++) {
      table[h * CATEGORY_IDS.length + c] = scoreCounts(CATEGORY_IDS[c], hands[h], rules);
    }
  }
  return table;
}
