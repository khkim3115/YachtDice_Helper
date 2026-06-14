// 스코어카드 모델 및 파생 계산(소계/보너스/총점, V 테이블용 상태 변환).

import type { CategoryId, RuleConfig } from './rules';
import { CATEGORY_IDS, UPPER_CATEGORIES } from './rules';
import { capUpper } from './stateIndex';

/** 카테고리 → 기록된 점수. 없으면 미기록(빈 칸). */
export interface Scorecard {
  scores: Partial<Record<CategoryId, number>>;
}

export function createScorecard(): Scorecard {
  return { scores: {} };
}

export function isCategoryFilled(card: Scorecard, cat: CategoryId): boolean {
  return card.scores[cat] !== undefined;
}

/** 불변 업데이트: 카테고리에 점수 기록한 새 카드 반환. */
export function recordScore(card: Scorecard, cat: CategoryId, value: number): Scorecard {
  if (isCategoryFilled(card, cat)) throw new Error(`category already filled: ${cat}`);
  return { scores: { ...card.scores, [cat]: value } };
}

export function upperSubtotal(card: Scorecard): number {
  let s = 0;
  for (const cat of UPPER_CATEGORIES) s += card.scores[cat] ?? 0;
  return s;
}

export function upperBonus(card: Scorecard, rules: RuleConfig): number {
  return upperSubtotal(card) >= rules.upperBonusThreshold ? rules.upperBonusAmount : 0;
}

export function lowerSubtotal(card: Scorecard): number {
  let s = 0;
  for (const cat of CATEGORY_IDS) {
    if ((UPPER_CATEGORIES as readonly string[]).includes(cat)) continue;
    s += card.scores[cat] ?? 0;
  }
  return s;
}

export function grandTotal(card: Scorecard, rules: RuleConfig): number {
  return upperSubtotal(card) + upperBonus(card, rules) + lowerSubtotal(card);
}

export function filledCount(card: Scorecard): number {
  return CATEGORY_IDS.reduce((n, cat) => n + (isCategoryFilled(card, cat) ? 1 : 0), 0);
}

export function isGameOver(card: Scorecard): boolean {
  return filledCount(card) === CATEGORY_IDS.length;
}

export function openCategories(card: Scorecard): CategoryId[] {
  return CATEGORY_IDS.filter((cat) => !isCategoryFilled(card, cat));
}

/** V 테이블 인덱싱용 12-bit 마스크(CATEGORY_IDS 순서). */
export function filledMaskOf(card: Scorecard): number {
  let mask = 0;
  for (let i = 0; i < CATEGORY_IDS.length; i++) {
    if (isCategoryFilled(card, CATEGORY_IDS[i])) mask |= 1 << i;
  }
  return mask;
}

/** V 테이블 인덱싱용 상단 소계(63 캡). */
export function cappedUpperOf(card: Scorecard): number {
  return capUpper(upperSubtotal(card));
}
