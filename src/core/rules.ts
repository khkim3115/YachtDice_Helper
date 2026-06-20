// 게임 룰 정의 — 채점 모듈 · 사전계산 · UI 가 모두 이 파일 하나만 참조한다.

export type CategoryId =
  | 'ones'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes'
  | 'choice'
  | 'fourKind'
  | 'fullHouse'
  | 'smallStraight'
  | 'largeStraight'
  | 'yacht';

/** 카테고리 순서(= 가치테이블 비트 인덱스 0..11). 절대 바꾸지 말 것 — V.bin 인덱싱과 직결됨. */
export const CATEGORY_IDS: readonly CategoryId[] = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'choice',
  'fourKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'yacht',
] as const;

export const NUM_CATEGORIES = CATEGORY_IDS.length; // 12

/** 상단 구역(보너스 대상) 카테고리. */
export const UPPER_CATEGORIES: readonly CategoryId[] = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
] as const;

export interface CategoryMeta {
  id: CategoryId;
  ko: string;
  en: string;
  section: 'upper' | 'lower';
  /** 짧은 설명(UI 툴팁용). */
  desc: string;
}

export const CATEGORY_META: Record<CategoryId, CategoryMeta> = {
  ones: { id: 'ones', ko: '원', en: 'Ones', section: 'upper', desc: '1의 눈 합' },
  twos: { id: 'twos', ko: '투', en: 'Twos', section: 'upper', desc: '2의 눈 합' },
  threes: { id: 'threes', ko: '쓰리', en: 'Threes', section: 'upper', desc: '3의 눈 합' },
  fours: { id: 'fours', ko: '포', en: 'Fours', section: 'upper', desc: '4의 눈 합' },
  fives: { id: 'fives', ko: '파이브', en: 'Fives', section: 'upper', desc: '5의 눈 합' },
  sixes: { id: 'sixes', ko: '식스', en: 'Sixes', section: 'upper', desc: '6의 눈 합' },
  choice: { id: 'choice', ko: '초이스', en: 'Choice', section: 'lower', desc: '주사위 5개 합' },
  fourKind: {
    id: 'fourKind',
    ko: '포카드',
    en: 'Four of a Kind',
    section: 'lower',
    desc: '같은 눈 4개 이상',
  },
  fullHouse: {
    id: 'fullHouse',
    ko: '풀하우스',
    en: 'Full House',
    section: 'lower',
    desc: '3개 + 2개',
  },
  smallStraight: {
    id: 'smallStraight',
    ko: '스몰 스트레이트',
    en: 'Small Straight',
    section: 'lower',
    desc: '연속된 4개',
  },
  largeStraight: {
    id: 'largeStraight',
    ko: '라지 스트레이트',
    en: 'Large Straight',
    section: 'lower',
    desc: '연속된 5개',
  },
  yacht: { id: 'yacht', ko: '요트', en: 'Yacht', section: 'lower', desc: '같은 눈 5개' },
};

export interface RuleConfig {
  /** 상단 보너스 조건(소계 ≥ threshold). */
  upperBonusThreshold: number;
  /** 상단 보너스 점수. */
  upperBonusAmount: number;
  /** 포카드 점수 방식. */
  fourKindScore: 'sumAll' | 'sumFour';
  /** 풀하우스 점수 방식. */
  fullHouseScore: 'sumAll' | 'fixed25';
  /** 스몰 스트레이트 고정 점수. */
  smallStraightScore: number;
  /** 라지 스트레이트 고정 점수. */
  largeStraightScore: number;
  /** 요트 고정 점수. */
  yachtScore: number;
  /** 5개 모두 같을 때 풀하우스로도 인정할지(하우스 룰). */
  fiveOfAKindCountsAsFullHouse: boolean;
}

/** 한국 모바일 앱 관례 기본 룰. */
export const DEFAULT_RULES: RuleConfig = {
  upperBonusThreshold: 63,
  upperBonusAmount: 35,
  fourKindScore: 'sumAll',
  fullHouseScore: 'sumAll',
  smallStraightScore: 15,
  largeStraightScore: 30,
  yachtScore: 50,
  fiveOfAKindCountsAsFullHouse: false,
};

export const DICE_COUNT = 5;
export const ROLLS_PER_TURN = 3; // 최초 1 + 리롤 2
export const MAX_REROLLS = ROLLS_PER_TURN - 1; // 2
