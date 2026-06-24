// 스코어카드 모델 및 파생 계산(소계/보너스/총점, V 테이블용 상태 변환).

import type { CategoryId, RuleConfig } from './rules';
import { CATEGORY_IDS, LOWER_FOUR_CATEGORIES, UPPER_CATEGORIES } from './rules';
import { capUpper } from './stateIndex';

/**
 * 카테고리 → 기록된 점수. 없으면 미기록(빈 칸).
 * masterCells: 요트의 달인 보너스로 소비된 칸 목록(추가 룰 전용).
 *   이 칸들은 빈 칸 1개를 차지하지만 정상 카테고리 점수가 아니라 보너스 점수다 —
 *   scores 에는 넣지 않으므로 상단/하단 소계·요트도 포커처럼 판정에서 자동 제외되고,
 *   총점에만 보너스로 더해진다(grandTotal). 기본 룰에서는 항상 비어 있다.
 */
export interface Scorecard {
  scores: Partial<Record<CategoryId, number>>;
  masterCells?: CategoryId[];
}

export function createScorecard(): Scorecard {
  return { scores: {}, masterCells: [] };
}

/** 요트의 달인 보너스로 소비된 칸인지. */
export function isMasterCell(card: Scorecard, cat: CategoryId): boolean {
  return card.masterCells?.includes(cat) ?? false;
}

export function isCategoryFilled(card: Scorecard, cat: CategoryId): boolean {
  return card.scores[cat] !== undefined || isMasterCell(card, cat);
}

/** 불변 업데이트: 카테고리에 점수 기록한 새 카드 반환. */
export function recordScore(card: Scorecard, cat: CategoryId, value: number): Scorecard {
  if (isCategoryFilled(card, cat)) throw new Error(`category already filled: ${cat}`);
  return { ...card, scores: { ...card.scores, [cat]: value } };
}

/**
 * 요트의 달인: 빈 칸 1개를 소비해 보너스 점수를 적는다(반복 가능).
 * 선택한 칸은 채워진 것으로 처리되지만 정상 점수가 아닌 보너스 칸으로 표시된다.
 */
export function recordMasterYachtBonus(card: Scorecard, chosenCat: CategoryId): Scorecard {
  if (isCategoryFilled(card, chosenCat)) throw new Error(`category already filled: ${chosenCat}`);
  return { ...card, masterCells: [...(card.masterCells ?? []), chosenCat] };
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

/** 요트의 달인 보너스 합(소비한 보너스 칸 수 × 보너스 점수). 추가 룰 전용. */
export function masterBonusTotal(card: Scorecard, rules: RuleConfig): number {
  if (!rules.multiYachtBonus) return 0;
  return (card.masterCells?.length ?? 0) * rules.multiYachtBonusAmount;
}

/** 요트도 포커처럼 조건 충족 여부: 하단 4종 모두 실제 조합(>0)으로 기록. */
export function lowerFourCompleted(card: Scorecard, rules: RuleConfig): boolean {
  if (!rules.lowerFourBonus) return false;
  return LOWER_FOUR_CATEGORIES.every((cat) => (card.scores[cat] ?? 0) > 0);
}

/** 요트도 포커처럼 보너스 점수(조건 충족 시 고정값, 아니면 0). */
export function lowerFourBonus(card: Scorecard, rules: RuleConfig): number {
  return lowerFourCompleted(card, rules) ? rules.lowerFourBonusAmount : 0;
}

export function grandTotal(card: Scorecard, rules: RuleConfig): number {
  return (
    upperSubtotal(card) +
    upperBonus(card, rules) +
    lowerSubtotal(card) +
    masterBonusTotal(card, rules) +
    lowerFourBonus(card, rules)
  );
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
