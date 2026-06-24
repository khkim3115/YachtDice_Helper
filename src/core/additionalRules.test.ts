// 추가 룰('additional' 프리셋) — 요트의 달인 / 요트도 포커처럼 채점 검증.

import { describe, expect, it } from 'vitest';
import { ADDITIONAL_RULES, DEFAULT_RULES, RULE_PRESETS } from './rules';
import { isFiveOfAKind } from './scoring';
import {
  createScorecard,
  filledCount,
  grandTotal,
  isCategoryFilled,
  isGameOver,
  isMasterCell,
  lowerFourBonus,
  lowerFourCompleted,
  lowerSubtotal,
  masterBonusTotal,
  recordMasterYachtBonus,
  recordScore,
  upperBonus,
  upperSubtotal,
} from './gameState';

const ADD = ADDITIONAL_RULES;

describe('프리셋 정의', () => {
  it('기본은 헬퍼 지원·보너스 off, 추가는 헬퍼 미지원·보너스 on', () => {
    expect(RULE_PRESETS.default.helperSupported).toBe(true);
    expect(RULE_PRESETS.default.config.multiYachtBonus).toBe(false);
    expect(RULE_PRESETS.default.config.lowerFourBonus).toBe(false);

    expect(RULE_PRESETS.additional.helperSupported).toBe(false);
    expect(ADD.multiYachtBonus).toBe(true);
    expect(ADD.multiYachtBonusAmount).toBe(100);
    expect(ADD.lowerFourBonus).toBe(true);
    expect(ADD.lowerFourBonusAmount).toBe(50);
  });
});

describe('isFiveOfAKind', () => {
  it('5개 같은 눈만 true', () => {
    expect(isFiveOfAKind([4, 4, 4, 4, 4])).toBe(true);
    expect(isFiveOfAKind([1, 1, 1, 1, 1])).toBe(true);
    expect(isFiveOfAKind([4, 4, 4, 4, 1])).toBe(false);
    expect(isFiveOfAKind([1, 2, 3, 4, 5])).toBe(false);
  });
});

describe('요트의 달인 — 보너스 칸', () => {
  it('빈 칸을 소비하고 총점엔 +100, 상단/하단 소계엔 미포함', () => {
    let card = createScorecard();
    card = recordScore(card, 'yacht', 50); // 첫 요트(하단)
    card = recordMasterYachtBonus(card, 'sixes'); // 두 번째 요트 → sixes 칸 소비

    expect(isCategoryFilled(card, 'sixes')).toBe(true);
    expect(isMasterCell(card, 'sixes')).toBe(true);
    // 상단 칸(sixes)을 보너스로 채웠어도 상단 소계엔 반영 안 됨.
    expect(upperSubtotal(card)).toBe(0);
    expect(upperBonus(card, ADD)).toBe(0);
    // 하단 소계는 yacht 50 만.
    expect(lowerSubtotal(card)).toBe(50);
    expect(masterBonusTotal(card, ADD)).toBe(100);
    // 총점 = 0 + 0 + 50 + 100 + 0
    expect(grandTotal(card, ADD)).toBe(150);
  });

  it('여러 번 발동하면 칸당 +100 누적', () => {
    let card = createScorecard();
    card = recordScore(card, 'yacht', 50);
    card = recordMasterYachtBonus(card, 'ones');
    card = recordMasterYachtBonus(card, 'twos');
    expect(masterBonusTotal(card, ADD)).toBe(200);
    expect(grandTotal(card, ADD)).toBe(50 + 200);
  });

  it('이미 채워진 칸엔 보너스 기록 불가', () => {
    let card = createScorecard();
    card = recordScore(card, 'ones', 3);
    expect(() => recordMasterYachtBonus(card, 'ones')).toThrow();
  });

  it('보너스 칸도 채운 칸으로 세어 게임 종료 판정에 반영', () => {
    let card = createScorecard();
    // 11칸 정상 기록 + 1칸 보너스 = 12칸.
    const cats = [
      'ones',
      'twos',
      'threes',
      'fours',
      'fives',
      'choice',
      'fourKind',
      'fullHouse',
      'smallStraight',
      'largeStraight',
      'yacht',
    ] as const;
    for (const c of cats) card = recordScore(card, c, 0);
    expect(filledCount(card)).toBe(11);
    expect(isGameOver(card)).toBe(false);
    card = recordMasterYachtBonus(card, 'sixes');
    expect(filledCount(card)).toBe(12);
    expect(isGameOver(card)).toBe(true);
  });
});

describe('요트도 포커처럼 — 하단 4종 완성 +50', () => {
  it('4종 모두 실제 조합(>0)이면 총점 +50', () => {
    let card = createScorecard();
    card = recordScore(card, 'fourKind', 20);
    card = recordScore(card, 'fullHouse', 18);
    card = recordScore(card, 'smallStraight', 15);
    expect(lowerFourCompleted(card, ADD)).toBe(false); // 3종뿐
    card = recordScore(card, 'largeStraight', 30);
    expect(lowerFourCompleted(card, ADD)).toBe(true);
    expect(lowerFourBonus(card, ADD)).toBe(50);
    expect(grandTotal(card, ADD)).toBe(20 + 18 + 15 + 30 + 50);
  });

  it('하나라도 0점이면 미발동', () => {
    let card = createScorecard();
    card = recordScore(card, 'fourKind', 0); // 덤프(미달성)
    card = recordScore(card, 'fullHouse', 18);
    card = recordScore(card, 'smallStraight', 15);
    card = recordScore(card, 'largeStraight', 30);
    expect(lowerFourCompleted(card, ADD)).toBe(false);
    expect(lowerFourBonus(card, ADD)).toBe(0);
  });

  it('보너스 칸으로 채운 하단 4종은 실제 조합으로 인정 안 함', () => {
    let card = createScorecard();
    card = recordScore(card, 'yacht', 50);
    card = recordMasterYachtBonus(card, 'fourKind'); // fourKind 를 보너스로 소비
    card = recordScore(card, 'fullHouse', 18);
    card = recordScore(card, 'smallStraight', 15);
    card = recordScore(card, 'largeStraight', 30);
    expect(lowerFourCompleted(card, ADD)).toBe(false);
  });
});

describe('기본 룰 회귀 — 보너스 비활성', () => {
  it('하단 4종을 모두 채워도 기본 룰에선 +50 없음', () => {
    let card = createScorecard();
    card = recordScore(card, 'fourKind', 20);
    card = recordScore(card, 'fullHouse', 18);
    card = recordScore(card, 'smallStraight', 15);
    card = recordScore(card, 'largeStraight', 30);
    expect(lowerFourBonus(card, DEFAULT_RULES)).toBe(0);
    expect(grandTotal(card, DEFAULT_RULES)).toBe(20 + 18 + 15 + 30);
  });

  it('masterBonusTotal 은 기본 룰에서 0', () => {
    const card = createScorecard();
    expect(masterBonusTotal(card, DEFAULT_RULES)).toBe(0);
  });
});
