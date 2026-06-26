import { describe, expect, it } from 'vitest';
import {
  STATE_COUNT_ADDITIONAL,
  YACHT_BIT,
  YACHT_INDEX,
  LOWER_FOUR_BITS,
  packStateAdditional,
} from './stateIndex';

describe('추가 상태 패킹', () => {
  it('상수값', () => {
    expect(STATE_COUNT_ADDITIONAL).toBe(1_048_576);
    expect(YACHT_INDEX).toBe(11);
    expect(YACHT_BIT).toBe(1 << 11);
    expect(LOWER_FOUR_BITS).toBe((1 << 7) | (1 << 8) | (1 << 9) | (1 << 10));
  });

  it('빈 카드 4조합이 0..3', () => {
    expect(packStateAdditional(0, 0, false, false)).toBe(0);
    expect(packStateAdditional(0, 0, false, true)).toBe(1);
    expect(packStateAdditional(0, 0, true, false)).toBe(2);
    expect(packStateAdditional(0, 0, true, true)).toBe(3);
  });

  it('최대 인덱스 = STATE_COUNT_ADDITIONAL-1, 충돌 없음', () => {
    expect(packStateAdditional(4095, 63, true, true)).toBe(STATE_COUNT_ADDITIONAL - 1);
    const seen = new Set<number>();
    for (const yf of [false, true]) {
      for (const la of [false, true]) {
        for (let upper = 0; upper < 64; upper++) {
          const idx = packStateAdditional(123, upper, yf, la);
          expect(seen.has(idx)).toBe(false);
          seen.add(idx);
        }
      }
    }
  });
});
