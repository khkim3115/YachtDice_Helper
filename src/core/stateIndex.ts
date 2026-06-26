// between-turns 상태 ↔ 정수 인덱스 패킹.
// 상태 = (채워진 카테고리 12-bit 마스크) × (상단 소계 0..63 캡).
// 이 인덱싱은 V.bin 의 바이트 배치와 직결 — 사전계산/런타임이 반드시 일치해야 한다.

import { CATEGORY_IDS, UPPER_CATEGORIES, NUM_CATEGORIES } from './rules';

export const UPPER_CAP = 63;
export const UPPER_LEVELS = UPPER_CAP + 1; // 64
export const FILLED_COUNT = 1 << NUM_CATEGORIES; // 4096
export const STATE_COUNT = FILLED_COUNT * UPPER_LEVELS; // 262144

/** 카테고리 인덱스(0..11)가 상단 구역인지. */
export const IS_UPPER: boolean[] = CATEGORY_IDS.map((id) =>
  (UPPER_CATEGORIES as readonly string[]).includes(id),
);

export function categoryBit(catIndex: number): number {
  return 1 << catIndex;
}

export function packState(filledMask: number, upperCapped: number): number {
  return filledMask * UPPER_LEVELS + upperCapped;
}

export function isFilled(filledMask: number, catIndex: number): boolean {
  return (filledMask & (1 << catIndex)) !== 0;
}

export function capUpper(value: number): number {
  return value > UPPER_CAP ? UPPER_CAP : value;
}

// ── 추가 룰(additional) 전용 패킹 ──────────────────────────────────────
// 상태 = (12비트 마스크 × 상단 0..63) × yachtFifty(1) × lowerAlive(1).
// index = (mask*64 + upper) * 4 + (yf?2:0) + (la?1:0). 기본 레이아웃과 별개.
export const STATE_COUNT_ADDITIONAL = STATE_COUNT * 4; // 1,048,576

/** yacht 카테고리 인덱스/비트(요트의 달인 게이트). */
export const YACHT_INDEX = CATEGORY_IDS.indexOf('yacht'); // 11
export const YACHT_BIT = 1 << YACHT_INDEX; // 2048

/** 하단 4종(fourKind·fullHouse·smallStraight·largeStraight) 비트 합. */
export const LOWER_FOUR_BITS = (1 << 7) | (1 << 8) | (1 << 9) | (1 << 10); // 1920

export function packStateAdditional(
  filledMask: number,
  upperCapped: number,
  yachtFifty: boolean,
  lowerAlive: boolean,
): number {
  return (filledMask * UPPER_LEVELS + upperCapped) * 4 + (yachtFifty ? 2 : 0) + (lowerAlive ? 1 : 0);
}
