import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDITIONAL_RULES } from '../core/rules';
import { STATE_COUNT_ADDITIONAL } from '../core/stateIndex';
import { createScorecard, recordScore } from '../core/gameState';
import { createAdvisor } from './advisor';
import type { ValueTable } from './valueTable';

function loadVAdditional(): ValueTable {
  const buf = readFileSync(resolve(process.cwd(), 'public', 'V.additional.bin'));
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

describe('advisor 추가 룰', () => {
  const advisor = createAdvisor(loadVAdditional(), ADDITIONAL_RULES);

  it('테이블 길이가 추가 룰 상태수', () => {
    expect(loadVAdditional().length).toBe(STATE_COUNT_ADDITIONAL);
  });

  it('요트50 기록 + 5개 같은 눈 → 윈드폴 추천', () => {
    const card = recordScore(createScorecard(), 'yacht', 50);
    const advice = advisor.advise(card, [3, 3, 3, 3, 3], 0);
    expect(advice.windfall?.active).toBe(true);
    expect(advice.windfall?.bonus).toBe(100);
    expect(advice.recommendScoreNow).toBe(true);
  });

  it('일반 상황 → 윈드폴 비활성', () => {
    const advice = advisor.advise(createScorecard(), [1, 2, 3, 4, 6], 0);
    expect(advice.windfall?.active ?? false).toBe(false);
  });
});
