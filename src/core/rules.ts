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
  /**
   * 요트의 달인: 요트(=yachtScore)를 이미 기록한 뒤 또 5개 같은 눈이 나오면,
   * 그 턴은 정상 채점 대신 빈 칸 1개를 소비해 보너스 점수를 적는다(반복 가능).
   * 보너스 점수는 총점에만 더하며 상단 소계·요트도 포커처럼 판정에는 포함하지 않는다.
   */
  multiYachtBonus: boolean;
  /** 요트의 달인 보너스 점수(빈 칸 1개당). */
  multiYachtBonusAmount: number;
  /**
   * 요트도 포커처럼: 하단 4종(포카드·풀하우스·스몰·라지 스트레이트)을
   * 모두 0점이 아닌 실제 조합으로 채우면 칸 소비 없이 총점에 보너스를 더한다.
   */
  lowerFourBonus: boolean;
  /** 요트도 포커처럼 보너스 점수. */
  lowerFourBonusAmount: number;
}

/**
 * 요트도 포커처럼 보너스 대상 하단 4종(요트 제외).
 * 4개 모두 실제 조합(>0)으로 채워야 보너스가 발동한다.
 */
export const LOWER_FOUR_CATEGORIES: readonly CategoryId[] = [
  'fourKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
] as const;

/**
 * 한국 모바일 앱 관례 기본 룰.
 * ⚠️ 이 객체의 어떤 필드든 바꾸면 V.bin 이 무효화된다(CLAUDE.md). 추가 룰은 별도 객체로 둔다.
 * 추가 보너스 플래그는 모두 off — 기본 룰의 채점·최적 평균(≈191.8)은 변하지 않는다.
 */
export const DEFAULT_RULES: RuleConfig = {
  upperBonusThreshold: 63,
  upperBonusAmount: 35,
  fourKindScore: 'sumAll',
  fullHouseScore: 'sumAll',
  smallStraightScore: 15,
  largeStraightScore: 30,
  yachtScore: 50,
  fiveOfAKindCountsAsFullHouse: false,
  multiYachtBonus: false,
  multiYachtBonusAmount: 0,
  lowerFourBonus: false,
  lowerFourBonusAmount: 0,
};

/**
 * 추가 룰 — 기본 채점은 동일하되 두 보너스 메커니즘을 켠다.
 * - 요트의 달인: 반복 요트 시 빈 칸 1개에 +100.
 * - 요트도 포커처럼: 하단 4종 실제 달성 시 총점 +50.
 * 헬퍼(V.bin)는 이 룰을 표현할 수 없어 비활성(별도 후속 이슈).
 */
export const ADDITIONAL_RULES: RuleConfig = {
  ...DEFAULT_RULES,
  multiYachtBonus: true,
  multiYachtBonusAmount: 100,
  lowerFourBonus: true,
  lowerFourBonusAmount: 50,
};

/** 룰 프리셋 식별자. 멀티 룸·리더보드의 rule_preset_id 와 동일 키를 쓴다. */
export type RulePresetId = 'default' | 'additional';

export interface RulePreset {
  id: RulePresetId;
  ko: string;
  en: string;
  /** 설정/방 만들기 UI 설명. */
  desc: string;
  config: RuleConfig;
  /** 최적-EV 헬퍼(V.bin) 지원 여부. additional 은 false. */
  helperSupported: boolean;
}

export const RULE_PRESETS: Record<RulePresetId, RulePreset> = {
  default: {
    id: 'default',
    ko: '기본 룰',
    en: 'Standard',
    desc: '한국 모바일 앱 관례 기본 규칙.',
    config: DEFAULT_RULES,
    helperSupported: true,
  },
  additional: {
    id: 'additional',
    ko: '추가 룰',
    en: 'Extra',
    desc: '요트의 달인(반복 요트 +100)·요트도 포커처럼(하단 4종 완성 +50).',
    config: ADDITIONAL_RULES,
    helperSupported: true,
  },
};

export const DEFAULT_PRESET_ID: RulePresetId = 'default';

export const DICE_COUNT = 5;
export const ROLLS_PER_TURN = 3; // 최초 1 + 리롤 2
export const MAX_REROLLS = ROLLS_PER_TURN - 1; // 2
