// 오프라인 사전계산(Node). between-turns 가치함수 V 를 후방귀납으로 풀어 public/V.bin 으로 저장.
//   V(filledMask, upperCapped) = 그 스코어카드에서 턴 시작 시 기대 추가 점수(최적 플레이).
// 의존: V(s) 는 카테고리 1개 더 채운 상태에만 의존 → popcount 내림차순 1패스로 위상정렬됨.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ALL_HANDS } from '../core/dice';
import { DEFAULT_RULES, MAX_REROLLS } from '../core/rules';
import { buildScoreTable } from '../core/scoring';
import { FILLED_COUNT, STATE_COUNT, UPPER_LEVELS, packState } from '../core/stateIndex';
import { buildOptimalLeaf } from '../engine/optimalLeaf';
import { solveLayers, turnStartValue } from '../engine/withinTurnDP';

function popcount(n: number): number {
  let c = 0;
  while (n) {
    n &= n - 1;
    c++;
  }
  return c;
}

function main() {
  const rules = DEFAULT_RULES;
  const t0 = Date.now();
  const scoreTable = buildScoreTable(ALL_HANDS, rules);
  const V = new Float32Array(STATE_COUNT); // 종단(전부 채움)은 0으로 초기화됨

  // filledMask 를 popcount 별로 묶음.
  const byPopcount: number[][] = Array.from({ length: 13 }, () => []);
  for (let mask = 0; mask < FILLED_COUNT; mask++) byPopcount[popcount(mask)].push(mask);

  // popcount 11 → 0 (12 는 종단=0). 각 mask 의 upper 0..63 전부 계산.
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
  const outDir = resolve(process.cwd(), 'public');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'V.bin');
  writeFileSync(outPath, Buffer.from(V.buffer, 0, V.byteLength));

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`V.bin 저장: ${outPath}`);
  console.log(`  states=${STATE_COUNT}, size=${(V.byteLength / 1e6).toFixed(2)}MB, time=${secs}s`);
  console.log(`  최적 기대 평균 점수(빈 카드에서) = ${optimalAverage.toFixed(3)}`);
}

main();
