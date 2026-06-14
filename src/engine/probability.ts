// 콤보 달성 확률. 점수 DP 와 동일한 재귀를 쓰되 leaf 를 0/1 지시함수로 교체 →
// "그 콤보를 향해 최적으로 리롤할 때의 P(달성)". 점수 규칙과 무관(패턴만 판정).

import type { Counts } from '../core/dice';
import { ALL_HANDS, HAND_COUNT } from '../core/dice';
import { solveLayers } from './withinTurnDP';

export type ComboId = 'yacht' | 'largeStraight' | 'smallStraight' | 'fullHouse' | 'fourKind';

export const COMBO_IDS: readonly ComboId[] = [
  'yacht',
  'largeStraight',
  'smallStraight',
  'fullHouse',
  'fourKind',
] as const;

export const COMBO_LABEL: Record<ComboId, string> = {
  yacht: '야추',
  largeStraight: '라지',
  smallStraight: '스몰',
  fullHouse: '풀하우스',
  fourKind: '포카드',
};

function hasRun(c: Counts, start: number, len: number): boolean {
  for (let v = start; v < start + len; v++) if (c[v] === 0) return false;
  return true;
}

function satisfies(combo: ComboId, c: Counts): boolean {
  switch (combo) {
    case 'yacht':
      return c[1] === 5 || c[2] === 5 || c[3] === 5 || c[4] === 5 || c[5] === 5 || c[6] === 5;
    case 'largeStraight':
      return hasRun(c, 1, 5) || hasRun(c, 2, 5);
    case 'smallStraight':
      return hasRun(c, 1, 4) || hasRun(c, 2, 4) || hasRun(c, 3, 4);
    case 'fullHouse': {
      let has2 = false;
      let has3 = false;
      for (let v = 1; v <= 6; v++) {
        if (c[v] === 2) has2 = true;
        if (c[v] === 3) has3 = true;
      }
      return has2 && has3;
    }
    case 'fourKind': {
      for (let v = 1; v <= 6; v++) if (c[v] >= 4) return true;
      return false;
    }
  }
}

/** 콤보별 0/1 leaf(252) — 모듈 로드 시 1회 생성. */
const comboLeaf: Record<ComboId, Float64Array> = (() => {
  const out = {} as Record<ComboId, Float64Array>;
  for (const combo of COMBO_IDS) {
    const leaf = new Float64Array(HAND_COUNT);
    for (let h = 0; h < HAND_COUNT; h++) leaf[h] = satisfies(combo, ALL_HANDS[h]) ? 1 : 0;
    out[combo] = leaf;
  }
  return out;
})();

/** 현재 손패에서 rerollsLeft 회 최적 리롤 시 콤보 달성 확률. */
export function comboProbability(combo: ComboId, handIndex: number, rerollsLeft: number): number {
  if (rerollsLeft <= 0) return comboLeaf[combo][handIndex];
  const layers = solveLayers(comboLeaf[combo], rerollsLeft);
  return layers[rerollsLeft][handIndex];
}

export { satisfies as comboSatisfied };
