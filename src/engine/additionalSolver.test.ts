import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDITIONAL_RULES } from '../core/rules';
import { STATE_COUNT_ADDITIONAL } from '../core/stateIndex';
import { getVAdditional } from './valueTable';
import type { ValueTable } from './valueTable';
import { simulateMany } from './simulate';

function loadVAdditional(): ValueTable {
  const buf = readFileSync(resolve(process.cwd(), 'public', 'V.additional.bin'));
  const table = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  if (table.length !== STATE_COUNT_ADDITIONAL) {
    throw new Error(`V.additional.bin 크기 불일치: ${table.length} (npm run build:table:additional)`);
  }
  return table;
}

describe('추가 룰 솔버 정합성 (V.additional.bin 필요)', () => {
  const V = loadVAdditional();
  const optimalAvg = getVAdditional(V, 0, 0, false, true);

  it('빈 카드 최적 기대값이 기본 룰(≈191.8)보다 높고 합리 범위', () => {
    expect(optimalAvg).toBeGreaterThan(195);
    expect(optimalAvg).toBeLessThan(300);
  });

  it('최적 정책 시뮬 평균 ≈ 테이블 예측값', () => {
    const stats = simulateMany(V, ADDITIONAL_RULES, 3000, 12345);
    expect(Math.abs(stats.mean - optimalAvg)).toBeLessThan(5);
    expect(stats.std).toBeGreaterThan(20);
  });
});
