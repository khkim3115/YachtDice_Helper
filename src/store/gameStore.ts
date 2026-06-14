// 게임 상태(솔로 점수 도전) + 설정 + 헬퍼(advisor) 통합. Zustand.

import { create } from 'zustand';
import type { CategoryId, RuleConfig } from '../core/rules';
import { DEFAULT_RULES, DICE_COUNT, ROLLS_PER_TURN } from '../core/rules';
import type { Scorecard } from '../core/gameState';
import { createScorecard, isCategoryFilled, isGameOver, recordScore } from '../core/gameState';
import { scoreDice } from '../core/scoring';
import type { Advisor } from '../engine/advisor';
import { createAdvisor } from '../engine/advisor';
import { loadValueTable } from '../engine/valueTable';

export type TableStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface Settings {
  helperEnabled: boolean;
  showProbabilities: boolean;
  /** 추천 주사위/카테고리 자동 하이라이트. */
  highlightSuggestion: boolean;
}

interface GameStore {
  rules: RuleConfig;
  card: Scorecard;
  dice: number[];
  held: boolean[];
  /** 이번 턴에 굴린 횟수(0 = 아직 안 굴림). */
  rollsUsed: number;
  settings: Settings;
  advisor: Advisor | null;
  tableStatus: TableStatus;
  /** 게임 종료 결과 팝업 표시 여부. */
  resultOpen: boolean;

  rerollsLeft: () => number;
  canRoll: () => boolean;
  canReroll: () => boolean;
  gameOver: () => boolean;

  loadTable: () => Promise<void>;
  roll: () => void;
  toggleHold: (i: number) => void;
  assign: (cat: CategoryId) => void;
  newGame: () => void;
  setSettings: (patch: Partial<Settings>) => void;
  setResultOpen: (open: boolean) => void;
}

function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}

const INITIAL_DICE = [1, 2, 3, 4, 5];

export const useGameStore = create<GameStore>((set, get) => ({
  rules: DEFAULT_RULES,
  card: createScorecard(),
  dice: [...INITIAL_DICE],
  held: Array(DICE_COUNT).fill(false),
  rollsUsed: 0,
  settings: { helperEnabled: false, showProbabilities: true, highlightSuggestion: true },
  advisor: null,
  tableStatus: 'idle',
  resultOpen: false,

  rerollsLeft: () => ROLLS_PER_TURN - get().rollsUsed,
  canRoll: () => !get().gameOver() && get().rollsUsed < ROLLS_PER_TURN,
  canReroll: () => {
    const s = get();
    return !s.gameOver() && s.rollsUsed > 0 && s.rollsUsed < ROLLS_PER_TURN;
  },
  gameOver: () => isGameOver(get().card),

  loadTable: async () => {
    if (get().tableStatus === 'loading' || get().tableStatus === 'ready') return;
    set({ tableStatus: 'loading' });
    try {
      const V = await loadValueTable(`${import.meta.env.BASE_URL}V.bin`);
      const advisor = createAdvisor(V, get().rules);
      set({ advisor, tableStatus: 'ready' });
    } catch (e) {
      console.error(e);
      set({ tableStatus: 'error' });
    }
  },

  roll: () => {
    const s = get();
    if (!s.canRoll()) return;
    if (s.rollsUsed === 0) {
      set({
        dice: Array.from({ length: DICE_COUNT }, rollDie),
        held: Array(DICE_COUNT).fill(false),
        rollsUsed: 1,
      });
    } else {
      set({
        dice: s.dice.map((d, i) => (s.held[i] ? d : rollDie())),
        rollsUsed: s.rollsUsed + 1,
      });
    }
  },

  toggleHold: (i) => {
    const s = get();
    if (!s.canReroll()) return;
    const held = s.held.slice();
    held[i] = !held[i];
    set({ held });
  },

  assign: (cat) => {
    const s = get();
    if (s.gameOver() || s.rollsUsed === 0 || isCategoryFilled(s.card, cat)) return;
    const value = scoreDice(cat, s.dice, s.rules);
    const card = recordScore(s.card, cat, value);
    set({
      card,
      dice: [...INITIAL_DICE],
      held: Array(DICE_COUNT).fill(false),
      rollsUsed: 0,
      resultOpen: isGameOver(card),
    });
  },

  newGame: () => {
    set({
      card: createScorecard(),
      dice: [...INITIAL_DICE],
      held: Array(DICE_COUNT).fill(false),
      rollsUsed: 0,
      resultOpen: false,
    });
  },

  setSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } });
    if (patch.helperEnabled && get().tableStatus === 'idle') {
      void get().loadTable();
    }
  },

  setResultOpen: (open) => set({ resultOpen: open }),
}));
