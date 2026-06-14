import { describe, expect, it } from 'vitest';
import {
  ALL_HANDS,
  HAND_COUNT,
  KEEP_COUNT,
  firstRollProb,
  keepChildren,
  handIndexOfDice,
  countsToDice,
  diceToCounts,
} from './dice';

describe('조합 구조', () => {
  it('손패 252개, 보관셋 462개', () => {
    expect(HAND_COUNT).toBe(252);
    expect(ALL_HANDS.length).toBe(252);
    expect(KEEP_COUNT).toBe(462);
  });

  it('신규 굴림 확률 합 = 1', () => {
    let s = 0;
    for (let i = 0; i < HAND_COUNT; i++) s += firstRollProb[i];
    expect(s).toBeCloseTo(1, 10);
  });

  it('각 보관셋의 리롤 결과 확률 합 = 1', () => {
    for (const children of keepChildren) {
      let s = 0;
      for (const ch of children) s += ch.prob;
      expect(s).toBeCloseTo(1, 10);
    }
  });

  it('주사위 ↔ 카운트 ↔ 인덱스 왕복', () => {
    const dice = [1, 3, 3, 6, 6];
    const idx = handIndexOfDice(dice);
    expect(countsToDice(diceToCounts(dice))).toEqual([1, 3, 3, 6, 6]);
    // 순서 무관
    expect(handIndexOfDice([6, 3, 1, 6, 3])).toBe(idx);
  });
});
