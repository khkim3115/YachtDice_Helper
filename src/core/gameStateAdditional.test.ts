import { describe, expect, it } from 'vitest';
import { ADDITIONAL_RULES } from './rules';
import {
  createScorecard,
  recordScore,
  recordMasterYachtBonus,
  yachtFiftyOf,
  lowerAliveOf,
} from './gameState';

const R = ADDITIONAL_RULES;

describe('yachtFiftyOf', () => {
  it('요트 50 기록 시 true', () => {
    expect(yachtFiftyOf(recordScore(createScorecard(), 'yacht', 50), R)).toBe(true);
  });
  it('요트 0 덤프/미기록 시 false', () => {
    expect(yachtFiftyOf(recordScore(createScorecard(), 'yacht', 0), R)).toBe(false);
    expect(yachtFiftyOf(createScorecard(), R)).toBe(false);
  });
});

describe('lowerAliveOf', () => {
  it('빈 카드는 alive', () => {
    expect(lowerAliveOf(createScorecard(), R)).toBe(true);
  });
  it('하단4종 실제(>0)는 alive 유지', () => {
    const c = recordScore(createScorecard(), 'fourKind', 20);
    expect(lowerAliveOf(c, R)).toBe(true);
  });
  it('하단4종 0-덤프는 dead', () => {
    const c = recordScore(createScorecard(), 'smallStraight', 0);
    expect(lowerAliveOf(c, R)).toBe(false);
  });
  it('하단4종 마스터 칸 점유는 dead', () => {
    const c = recordMasterYachtBonus(createScorecard(), 'largeStraight');
    expect(lowerAliveOf(c, R)).toBe(false);
  });
});
