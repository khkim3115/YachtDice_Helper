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
