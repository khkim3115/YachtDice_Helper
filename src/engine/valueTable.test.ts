import { describe, expect, it } from 'vitest';
import { STATE_COUNT_ADDITIONAL, packStateAdditional } from '../core/stateIndex';
import { getVAdditional } from './valueTable';

describe('getVAdditional', () => {
  it('packStateAdditional 과 동일 인덱싱', () => {
    const t = new Float32Array(STATE_COUNT_ADDITIONAL);
    t[packStateAdditional(123, 45, true, false)] = 7.5;
    expect(getVAdditional(t, 123, 45, true, false)).toBe(7.5);
    expect(getVAdditional(t, 123, 45, true, true)).toBe(0);
  });
});
