import { describe, expect, it } from 'vitest';
import { ALL_HANDS, HAND_COUNT, handIndexOfDice } from '../core/dice';
import { solveLayers, turnStartValue } from './withinTurnDP';
import { comboProbability, comboSatisfied } from './probability';

function comboLeaf(combo: Parameters<typeof comboSatisfied>[0]): Float64Array {
  const leaf = new Float64Array(HAND_COUNT);
  for (let h = 0; h < HAND_COUNT; h++) leaf[h] = comboSatisfied(combo, ALL_HANDS[h]) ? 1 : 0;
  return leaf;
}

describe('콤보 확률 (문헌값 대조)', () => {
  it('P(요트 | 빈 시작, 리롤 2, 최적) ≈ 0.04603', () => {
    const layers = solveLayers(comboLeaf('yacht'), 2);
    const p = turnStartValue(layers[2]);
    expect(p).toBeCloseTo(0.04603, 4);
  });

  it('P(스몰 | (1,2,3,3,6), 리롤 2, 최적) ≈ 0.518', () => {
    const p = comboProbability('smallStraight', handIndexOfDice([1, 2, 3, 3, 6]), 2);
    expect(p).toBeGreaterThan(0.51);
    expect(p).toBeLessThan(0.525);
  });

  it('리롤 0이면 지시값(0/1)', () => {
    expect(comboProbability('yacht', handIndexOfDice([5, 5, 5, 5, 5]), 0)).toBe(1);
    expect(comboProbability('yacht', handIndexOfDice([5, 5, 5, 5, 1]), 0)).toBe(0);
    expect(comboProbability('largeStraight', handIndexOfDice([2, 3, 4, 5, 6]), 0)).toBe(1);
  });
});
