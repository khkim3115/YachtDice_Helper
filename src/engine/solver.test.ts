import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../core/rules';
import { STATE_COUNT, packState } from '../core/stateIndex';
import type { ValueTable } from './valueTable';
import { simulateMany } from './simulate';

function loadV(): ValueTable {
  const buf = readFileSync(resolve(process.cwd(), 'public', 'V.bin'));
  const table = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  if (table.length !== STATE_COUNT) {
    throw new Error(`V.bin 크기 불일치: ${table.length} (먼저 npm run build:table 실행)`);
  }
  return table;
}

describe('솔버 정합성 (V.bin 필요)', () => {
  const V = loadV();
  const optimalAvg = V[packState(0, 0)];

  it('빈 카드 최적 기대값이 합리적 범위(~190~210)', () => {
    expect(optimalAvg).toBeGreaterThan(185);
    expect(optimalAvg).toBeLessThan(215);
  });

  it('최적 정책 시뮬 평균 ≈ 테이블 예측값', () => {
    const stats = simulateMany(V, DEFAULT_RULES, 3000, 12345);
    // 표준오차 ~ std/sqrt(3000) ≈ 1점. 여유롭게 ±5.
    expect(Math.abs(stats.mean - optimalAvg)).toBeLessThan(5);
    expect(stats.std).toBeGreaterThan(20); // 분산이 0이 아님(정상 플레이)
  });
});
