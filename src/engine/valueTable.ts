// 가치 테이블 V 의 로드/인덱싱. V.bin = STATE_COUNT 길이의 raw Float32 (little-endian).

import { STATE_COUNT, UPPER_LEVELS } from '../core/stateIndex';

export type ValueTable = Float32Array;

/** V[state] 조회. filledMask(12-bit) × upperCapped(0..63). */
export function getV(table: ValueTable, filledMask: number, upperCapped: number): number {
  return table[filledMask * UPPER_LEVELS + upperCapped];
}

/** 추가 룰 V 조회. (mask*64 + upper)*4 + yf*2 + la. */
export function getVAdditional(
  table: ValueTable,
  filledMask: number,
  upperCapped: number,
  yachtFifty: boolean,
  lowerAlive: boolean,
): number {
  return table[(filledMask * UPPER_LEVELS + upperCapped) * 4 + (yachtFifty ? 2 : 0) + (lowerAlive ? 1 : 0)];
}

/** 바이너리 자산에서 V 로드. 길이 검증 포함(프리셋별 상태수). */
export async function loadValueTable(
  url: string,
  expectedLength: number = STATE_COUNT,
): Promise<ValueTable> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load value table: ${res.status} ${url}`);
  const buf = await res.arrayBuffer();
  const table = new Float32Array(buf);
  if (table.length !== expectedLength) {
    throw new Error(`value table size mismatch: got ${table.length}, expected ${expectedLength}`);
  }
  return table;
}
