import { describe, expect, it } from 'vitest';
import { scoreDice } from './scoring';
import { DEFAULT_RULES } from './rules';
import type { RuleConfig } from './rules';
import {
  createScorecard,
  recordScore,
  grandTotal,
  upperBonus,
  upperSubtotal,
} from './gameState';

const R = DEFAULT_RULES;

describe('scoreDice — 상단', () => {
  it('각 눈 합', () => {
    expect(scoreDice('ones', [1, 1, 1, 2, 3], R)).toBe(3);
    expect(scoreDice('twos', [2, 2, 5, 6, 2], R)).toBe(6);
    expect(scoreDice('sixes', [6, 6, 6, 6, 1], R)).toBe(24);
    expect(scoreDice('threes', [1, 2, 4, 5, 6], R)).toBe(0);
  });
});

describe('scoreDice — 하단', () => {
  it('초이스 = 합', () => {
    expect(scoreDice('choice', [1, 2, 3, 4, 5], R)).toBe(15);
    expect(scoreDice('choice', [6, 6, 6, 6, 6], R)).toBe(30);
  });

  it('포카드 = 5개 합(기본), 조건 미달 0', () => {
    expect(scoreDice('fourKind', [6, 6, 6, 6, 2], R)).toBe(26);
    expect(scoreDice('fourKind', [5, 5, 5, 5, 5], R)).toBe(25); // 5개도 ≥4 충족
    expect(scoreDice('fourKind', [6, 6, 6, 2, 2], R)).toBe(0);
  });

  it('포카드 변형 = 4개만 합', () => {
    const v: RuleConfig = { ...R, fourKindScore: 'sumFour' };
    expect(scoreDice('fourKind', [6, 6, 6, 6, 2], v)).toBe(24);
    expect(scoreDice('fourKind', [3, 3, 3, 3, 5], v)).toBe(12);
  });

  it('풀하우스 = 5개 합, 두 서로 다른 눈 필요', () => {
    expect(scoreDice('fullHouse', [3, 3, 3, 2, 2], R)).toBe(13);
    expect(scoreDice('fullHouse', [6, 6, 6, 5, 5], R)).toBe(28);
    expect(scoreDice('fullHouse', [3, 3, 3, 3, 2], R)).toBe(0); // 4+1
    expect(scoreDice('fullHouse', [5, 5, 5, 5, 5], R)).toBe(0); // 기본: 5개는 풀하우스 아님
  });

  it('풀하우스 변형 — 고정 25 / 5개 인정', () => {
    expect(scoreDice('fullHouse', [3, 3, 3, 2, 2], { ...R, fullHouseScore: 'fixed25' })).toBe(25);
    expect(
      scoreDice('fullHouse', [4, 4, 4, 4, 4], { ...R, fiveOfAKindCountsAsFullHouse: true }),
    ).toBe(20);
  });

  it('스몰 스트레이트 = 15', () => {
    expect(scoreDice('smallStraight', [1, 2, 3, 4, 6], R)).toBe(15);
    expect(scoreDice('smallStraight', [3, 4, 5, 6, 6], R)).toBe(15);
    expect(scoreDice('smallStraight', [2, 3, 4, 5, 5], R)).toBe(15);
    expect(scoreDice('smallStraight', [1, 2, 4, 5, 6], R)).toBe(0);
  });

  it('라지 스트레이트 = 30, 12345·23456 모두', () => {
    expect(scoreDice('largeStraight', [1, 2, 3, 4, 5], R)).toBe(30);
    expect(scoreDice('largeStraight', [2, 3, 4, 5, 6], R)).toBe(30);
    expect(scoreDice('largeStraight', [1, 2, 3, 4, 6], R)).toBe(0);
  });

  it('요트 = 50', () => {
    expect(scoreDice('yacht', [4, 4, 4, 4, 4], R)).toBe(50);
    expect(scoreDice('yacht', [4, 4, 4, 4, 1], R)).toBe(0);
  });
});

describe('상단 보너스 / 총점', () => {
  it('소계 63 이상이면 +35', () => {
    let card = createScorecard();
    // 각 상단을 3개씩: 3+6+9+12+15+18 = 63
    card = recordScore(card, 'ones', 3);
    card = recordScore(card, 'twos', 6);
    card = recordScore(card, 'threes', 9);
    card = recordScore(card, 'fours', 12);
    card = recordScore(card, 'fives', 15);
    card = recordScore(card, 'sixes', 18);
    expect(upperSubtotal(card)).toBe(63);
    expect(upperBonus(card, R)).toBe(35);
    expect(grandTotal(card, R)).toBe(63 + 35);
  });

  it('소계 62면 보너스 없음', () => {
    let card = createScorecard();
    card = recordScore(card, 'sixes', 24);
    card = recordScore(card, 'fives', 20);
    card = recordScore(card, 'fours', 16); // 60
    card = recordScore(card, 'ones', 2); // 62
    expect(upperSubtotal(card)).toBe(62);
    expect(upperBonus(card, R)).toBe(0);
  });
});
