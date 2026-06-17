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

export type ThemeMode = 'light' | 'dark';

export interface Settings {
  helperEnabled: boolean;
  showProbabilities: boolean;
  /** 추천 주사위/카테고리 자동 하이라이트. */
  highlightSuggestion: boolean;
}

/** 되돌리기용 턴 직전 상태 스냅샷(기록 직전에 저장). */
interface SoloSnapshot {
  card: Scorecard;
  dice: number[];
  held: boolean[];
  rollsUsed: number;
  resultOpen: boolean;
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
  /** 이번 게임에서 헬퍼 조언이 한 번이라도 표시됐는지(리더보드 등록 자격 판단). newGame 시 리셋. */
  helperUsedThisGame: boolean;
  /** 기록 시점마다 쌓는 되돌리기 스택(턴 단위). newGame 시 리셋. */
  history: SoloSnapshot[];
  /** 이번 게임에서 되돌리기를 한 번이라도 썼는지(리더보드 등록 자격 판단). newGame 시 리셋. */
  undoUsedThisGame: boolean;
  /** 현재 테마(다크/라이트). */
  theme: ThemeMode;

  rerollsLeft: () => number;
  canRoll: () => boolean;
  canReroll: () => boolean;
  gameOver: () => boolean;
  /** 되돌리기 가능 여부(기록 이력이 있고 턴 시작 시점일 때만). */
  canUndo: () => boolean;

  loadTable: () => Promise<void>;
  roll: () => void;
  toggleHold: (i: number) => void;
  assign: (cat: CategoryId) => void;
  /** 마지막 기록을 취소하고 그 턴 직전 상태로 복원(리더보드 등록 자격 박탈). */
  undo: () => void;
  newGame: () => void;
  setSettings: (patch: Partial<Settings>) => void;
  setResultOpen: (open: boolean) => void;
  /** 헬퍼 조언이 실제 표시됐음을 기록(useAdvice 가 non-null 일 때 호출). */
  markHelperUsed: () => void;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

/** index.html 인라인 스크립트가 이미 결정해 둔 값을 단일 출처로 되읽음(중복 로직·깜빡임 방지). */
function getInitialTheme(): ThemeMode {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem('yd_theme', mode);
  } catch {
    // 저장 불가(사파리 사생활 모드 등) — 적용만 하고 영속화는 생략.
  }
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
  helperUsedThisGame: false,
  history: [],
  undoUsedThisGame: false,
  theme: getInitialTheme(),

  rerollsLeft: () => ROLLS_PER_TURN - get().rollsUsed,
  canRoll: () => !get().gameOver() && get().rollsUsed < ROLLS_PER_TURN,
  canReroll: () => {
    const s = get();
    return !s.gameOver() && s.rollsUsed > 0 && s.rollsUsed < ROLLS_PER_TURN;
  },
  gameOver: () => isGameOver(get().card),
  // 진행 중인 굴림을 잃지 않도록 턴 시작 시점(굴리기 전)에만 활성화.
  canUndo: () => {
    const s = get();
    return s.history.length > 0 && s.rollsUsed === 0;
  },

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
      // 되돌리기용으로 기록 직전 상태를 스택에 저장(배열은 복사본).
      history: [
        ...s.history,
        { card: s.card, dice: [...s.dice], held: [...s.held], rollsUsed: s.rollsUsed, resultOpen: s.resultOpen },
      ],
    });
  },

  undo: () => {
    const s = get();
    if (s.history.length === 0) return;
    const prev = s.history[s.history.length - 1];
    set({
      card: prev.card,
      dice: [...prev.dice],
      held: [...prev.held],
      rollsUsed: prev.rollsUsed,
      resultOpen: prev.resultOpen,
      history: s.history.slice(0, -1),
      undoUsedThisGame: true,
    });
  },

  newGame: () => {
    set({
      card: createScorecard(),
      dice: [...INITIAL_DICE],
      held: Array(DICE_COUNT).fill(false),
      rollsUsed: 0,
      resultOpen: false,
      helperUsedThisGame: false,
      history: [],
      undoUsedThisGame: false,
    });
  },

  setSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } });
    if (patch.helperEnabled && get().tableStatus === 'idle') {
      void get().loadTable();
    }
  },

  setResultOpen: (open) => set({ resultOpen: open }),

  markHelperUsed: () => {
    if (!get().helperUsedThisGame) set({ helperUsedThisGame: true });
  },

  setTheme: (mode) => {
    applyTheme(mode);
    set({ theme: mode });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));
