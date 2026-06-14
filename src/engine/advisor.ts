// 헬퍼 공개 API. UI 는 createAdvisor(V, rules).advise(card, dice, rerollsLeft) 만 호출한다.

import { ALL_HANDS, ALL_KEEPS, HAND_COUNT, handIndexOfDice, keepSizes } from '../core/dice';
import type { Counts } from '../core/dice';
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
import { bestKeep, solveLayers } from './withinTurnDP';
import { COMBO_IDS, COMBO_LABEL, comboProbability } from './probability';
import type { ComboId } from './probability';

export interface PerCategoryAdvice {
  category: CategoryId;
  filled: boolean;
  /** 현재 손패로 지금 기록 시 점수. */
  scoreNow: number;
  /** 이 카테고리를 노리고 최적 리롤 시 기대 점수(리롤 남았을 때만 ≠ scoreNow). */
  evIfReroll: number;
  /** evIfReroll - scoreNow. */
  delta: number;
}

export interface ComboProbInfo {
  combo: ComboId;
  label: string;
  prob: number;
}

export interface Advice {
  rerollsLeft: number;
  /** 지금 기록을 권하는가(리롤 0 이거나 리롤이 이득 없을 때). */
  recommendScoreNow: boolean;
  /** 길이 5, 리롤 시 보관 추천 위치. */
  holdMask: boolean[];
  /** 추천 기록 카테고리(지금 기록한다면). */
  bestCategory: CategoryId;
  bestCategoryScoreNow: number;
  /** 현재 위치에서 최적 플레이 시 기대 최종 총점. */
  expectedFinalScore: number;
  /** 리롤로 얻는 기대 향상(점, 게임 전체 기준). */
  evGainFromReroll: number;
  perCategory: PerCategoryAdvice[];
  comboProbs: ComboProbInfo[];
}

export interface Advisor {
  advise(card: Scorecard, dice: readonly number[], rerollsLeft: number): Advice;
}

function keepToHoldMask(keep: Counts, dice: readonly number[]): boolean[] {
  const remaining = keep.slice();
  return dice.map((d) => {
    if (remaining[d] > 0) {
      remaining[d]--;
      return true;
    }
    return false;
  });
}

export function createAdvisor(V: ValueTable, rules: RuleConfig): Advisor {
  const scoreTable = buildScoreTable(ALL_HANDS, rules);

  // 카테고리별 컬럼 leaf(상수) 사전 추출.
  const columnLeaf: Float64Array[] = CATEGORY_IDS.map((_, c) => {
    const leaf = new Float64Array(HAND_COUNT);
    for (let h = 0; h < HAND_COUNT; h++) leaf[h] = scoreTable[h * NUM_CATEGORIES + c];
    return leaf;
  });

  function advise(card: Scorecard, dice: readonly number[], rerollsLeft: number): Advice {
    const handIndex = handIndexOfDice(dice);
    const filledMask = filledMaskOf(card);
    const cappedUpper = cappedUpperOf(card);
    const alreadyTotal = grandTotal(card, rules);

    // 게임 전체 최적: leaf = 지금 기록 가치.
    const leaf = buildOptimalLeaf(scoreTable, V, filledMask, cappedUpper, rules);
    const scoreNow = scoreNowChoiceForHand(
      scoreTable,
      V,
      filledMask,
      cappedUpper,
      rules,
      handIndex,
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

    const perCategory: PerCategoryAdvice[] = CATEGORY_IDS.map((category, c) => {
      const filled = isCategoryFilled(card, category);
      const sNow = scoreTable[handIndex * NUM_CATEGORIES + c];
      let evIfReroll = sNow;
      if (rerollsLeft > 0) {
        const layers = solveLayers(columnLeaf[c], rerollsLeft);
        evIfReroll = layers[rerollsLeft][handIndex];
      }
      return { category, filled, scoreNow: sNow, evIfReroll, delta: evIfReroll - sNow };
    });

    const comboProbs: ComboProbInfo[] = COMBO_IDS.map((combo) => ({
      combo,
      label: COMBO_LABEL[combo],
      prob: comboProbability(combo, handIndex, rerollsLeft),
    }));

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

  return { advise };
}
