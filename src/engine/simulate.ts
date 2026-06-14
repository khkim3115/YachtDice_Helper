// 최적 정책으로 게임을 시뮬레이션(솔버 검증/통계용). 표시용 계산(카테고리별 EV·콤보)은
// 생략하고 정책 결정에 필요한 부분만 계산해 빠르다.

import { ALL_HANDS, ALL_KEEPS, diceToCounts, handIndexOfDice, keepSizes } from '../core/dice';
import type { Scorecard } from '../core/gameState';
import {
  cappedUpperOf,
  createScorecard,
  filledMaskOf,
  grandTotal,
  recordScore,
} from '../core/gameState';
import type { RuleConfig } from '../core/rules';
import { CATEGORY_IDS, MAX_REROLLS, NUM_CATEGORIES } from '../core/rules';
import { buildScoreTable, scoreCounts } from '../core/scoring';
import { buildOptimalLeaf, scoreNowChoiceForHand } from './optimalLeaf';
import type { ValueTable } from './valueTable';
import { bestKeep, solveLayers } from './withinTurnDP';

/** [0,1) 난수 생성기. */
export type RNG = () => number;

/** 결정적 시드 RNG (mulberry32). */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollDie(rng: RNG): number {
  return 1 + Math.floor(rng() * 6);
}

export interface Policy {
  playOneGame(rng: RNG): { total: number; card: Scorecard };
}

export function createPolicy(V: ValueTable, rules: RuleConfig): Policy {
  const scoreTable = buildScoreTable(ALL_HANDS, rules);

  function playOneGame(rng: RNG): { total: number; card: Scorecard } {
    let card = createScorecard();
    for (let turn = 0; turn < NUM_CATEGORIES; turn++) {
      let dice = [rollDie(rng), rollDie(rng), rollDie(rng), rollDie(rng), rollDie(rng)];
      for (let r = MAX_REROLLS; ; r--) {
        const handIndex = handIndexOfDice(dice);
        const filledMask = filledMaskOf(card);
        const cappedUpper = cappedUpperOf(card);
        const leaf = buildOptimalLeaf(scoreTable, V, filledMask, cappedUpper, rules);
        if (r > 0) {
          const layers = solveLayers(leaf, r);
          const bk = bestKeep(layers[r - 1], handIndex);
          if (keepSizes[bk.keepIndex] !== 5) {
            const remaining = ALL_KEEPS[bk.keepIndex].slice();
            dice = dice.map((d) => {
              if (remaining[d] > 0) {
                remaining[d]--;
                return d;
              }
              return rollDie(rng);
            });
            continue;
          }
        }
        const choice = scoreNowChoiceForHand(scoreTable, V, filledMask, cappedUpper, rules, handIndex);
        const cat = CATEGORY_IDS[choice.categoryIndex];
        card = recordScore(card, cat, scoreCounts(cat, diceToCounts(dice), rules));
        break;
      }
    }
    return { total: grandTotal(card, rules), card };
  }

  return { playOneGame };
}

export interface SimStats {
  games: number;
  mean: number;
  std: number;
  min: number;
  max: number;
}

export function simulateMany(V: ValueTable, rules: RuleConfig, games: number, seed = 1): SimStats {
  const policy = createPolicy(V, rules);
  const rng = mulberry32(seed);
  let sum = 0;
  let sumSq = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < games; i++) {
    const { total } = policy.playOneGame(rng);
    sum += total;
    sumSq += total * total;
    if (total < min) min = total;
    if (total > max) max = total;
  }
  const mean = sum / games;
  const variance = sumSq / games - mean * mean;
  return { games, mean, std: Math.sqrt(Math.max(0, variance)), min, max };
}
