// 오프라인 사전계산(Node). between-turns 가치함수 V 를 후방귀납으로 풀어 저장.
//   기본: public/V.bin  (mask×upper, 262144)
//   추가: public/V.additional.bin (mask×upper×yf×la, 1,048,576)
// CLI: `tsx src/precompute/buildValueTable.ts [default|additional]` (기본 default).

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ALL_HANDS } from '../core/dice';
import { ADDITIONAL_RULES, DEFAULT_RULES, MAX_REROLLS } from '../core/rules';
import { buildScoreTable } from '../core/scoring';
import {
  FILLED_COUNT,
  LOWER_FOUR_BITS,
  STATE_COUNT,
  STATE_COUNT_ADDITIONAL,
  UPPER_LEVELS,
  YACHT_BIT,
  packState,
  packStateAdditional,
} from '../core/stateIndex';
import { buildOptimalLeaf, buildOptimalLeafAdditional } from '../engine/optimalLeaf';
import { solveLayers, turnStartValue } from '../engine/withinTurnDP';

function popcount(n: number): number {
  let c = 0;
  while (n) {
    n &= n - 1;
    c++;
  }
  return c;
}

function masksByPopcount(): number[][] {
  const byPopcount: number[][] = Array.from({ length: 13 }, () => []);
  for (let mask = 0; mask < FILLED_COUNT; mask++) byPopcount[popcount(mask)].push(mask);
  return byPopcount;
}

function buildDefault() {
  const rules = DEFAULT_RULES;
  const t0 = Date.now();
  const scoreTable = buildScoreTable(ALL_HANDS, rules);
  const V = new Float32Array(STATE_COUNT);
  const byPopcount = masksByPopcount();
  for (let pc = 11; pc >= 0; pc--) {
    for (const mask of byPopcount[pc]) {
      for (let upper = 0; upper < UPPER_LEVELS; upper++) {
        const leaf = buildOptimalLeaf(scoreTable, V, mask, upper, rules);
        const layers = solveLayers(leaf, MAX_REROLLS);
        V[packState(mask, upper)] = turnStartValue(layers[MAX_REROLLS]);
      }
    }
    process.stdout.write(
      `\r  popcount ${pc} 완료 (${byPopcount[pc].length} masks)  경과 ${((Date.now() - t0) / 1000).toFixed(1)}s   `,
    );
  }
  process.stdout.write('\n');
  const optimalAverage = V[packState(0, 0)];
  writeTable('V.bin', V);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  states=${STATE_COUNT}, size=${(V.byteLength / 1e6).toFixed(2)}MB, time=${secs}s`);
  console.log(`  최적 기대 평균 점수(빈 카드에서) = ${optimalAverage.toFixed(3)}`);
}

function buildAdditional() {
  const rules = ADDITIONAL_RULES;
  const t0 = Date.now();
  const scoreTable = buildScoreTable(ALL_HANDS, rules);
  const V = new Float32Array(STATE_COUNT_ADDITIONAL); // 도달불가 조합은 0으로 남음(참조 안 됨)
  const byPopcount = masksByPopcount();
  for (let pc = 11; pc >= 0; pc--) {
    for (const mask of byPopcount[pc]) {
      const yfOpts = (mask & YACHT_BIT) !== 0 ? [false, true] : [false];
      const laOpts = (mask & LOWER_FOUR_BITS) !== 0 ? [false, true] : [true];
      for (let upper = 0; upper < UPPER_LEVELS; upper++) {
        for (const yf of yfOpts) {
          for (const la of laOpts) {
            const leaf = buildOptimalLeafAdditional(scoreTable, V, mask, upper, yf, la, rules);
            const layers = solveLayers(leaf, MAX_REROLLS);
            V[packStateAdditional(mask, upper, yf, la)] = turnStartValue(layers[MAX_REROLLS]);
          }
        }
      }
    }
    process.stdout.write(
      `\r  [additional] popcount ${pc} 완료 (${byPopcount[pc].length} masks)  경과 ${((Date.now() - t0) / 1000).toFixed(1)}s   `,
    );
  }
  process.stdout.write('\n');
  const optimalAverage = V[packStateAdditional(0, 0, false, true)];
  writeTable('V.additional.bin', V);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `  states=${STATE_COUNT_ADDITIONAL}, size=${(V.byteLength / 1e6).toFixed(2)}MB, time=${secs}s`,
  );
  console.log(`  [additional] 최적 기대 평균 점수(빈 카드에서) = ${optimalAverage.toFixed(3)}`);
}

function writeTable(name: string, V: Float32Array) {
  const outDir = resolve(process.cwd(), 'public');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, name);
  writeFileSync(outPath, Buffer.from(V.buffer, 0, V.byteLength));
  console.log(`${name} 저장: ${outPath}`);
}

function main() {
  const preset = process.argv[2] === 'additional' ? 'additional' : 'default';
  if (preset === 'additional') buildAdditional();
  else buildDefault();
}

main();
