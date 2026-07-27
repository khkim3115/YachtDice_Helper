// 게임 상태(솔로 점수 도전) + 설정 + 헬퍼(advisor) 통합. Zustand.

import { create } from 'zustand';
import type { CategoryId, RuleConfig, RulePresetId } from '../core/rules';
import { DEFAULT_PRESET_ID, DICE_COUNT, ROLLS_PER_TURN, RULE_PRESETS } from '../core/rules';
import { STATE_COUNT, STATE_COUNT_ADDITIONAL } from '../core/stateIndex';
import type { Scorecard } from '../core/gameState';
import {
  createScorecard,
  filledCount,
  grandTotal,
  isCategoryFilled,
  isGameOver,
  recordMasterYachtBonus,
  recordScore,
} from '../core/gameState';
import { isFiveOfAKind, scoreDice } from '../core/scoring';
import type { Advisor } from '../engine/advisor';
import { createAdvisor } from '../engine/advisor';
import { loadValueTable } from '../engine/valueTable';
import type { AvgMode, AvgStats } from '../core/averageStats';
import {
  bucketKey, meetsPartialFloor, recordCompleted, recordPartial, resetBucket, reverseRecord,
} from '../core/averageStats';
import {
  loadIncludeDefault, loadStats, saveIncludeDefault, saveStats,
} from './averageStorage';

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
  /** 현재 룰 프리셋 식별자(기본/추가). */
  rulePreset: RulePresetId;
  rules: RuleConfig;
  card: Scorecard;
  dice: number[];
  held: boolean[];
  /** 이번 턴에 굴린 횟수(0 = 아직 안 굴림). */
  rollsUsed: number;
  settings: Settings;
  advisor: Advisor | null;
  /** 현재 로드된 advisor 가 어느 프리셋용인지(보드 프리셋과 불일치 시 조언 미사용). */
  advisorPreset: RulePresetId | null;
  tableStatus: TableStatus;
  /** 게임 종료 결과 팝업 표시 여부. */
  resultOpen: boolean;
  /** 이번 게임에서 헬퍼 조언이 한 번이라도 표시됐는지(리더보드 등록 자격 판단). newGame 시 리셋. */
  helperUsedThisGame: boolean;
  /** 기록 시점마다 쌓는 되돌리기 스택(턴 단위). newGame 시 리셋. */
  history: SoloSnapshot[];
  /** 이번 게임에서 되돌리기를 한 번이라도 썼는지(리더보드 등록 자격 판단). newGame 시 리셋. */
  undoUsedThisGame: boolean;
  /** 이번 게임 점수를 리더보드에 이미 등록했는지(중복 등록 방지). newGame 시 리셋. */
  scoreSubmittedThisGame: boolean;
  /** 현재 테마(다크/라이트). */
  theme: ThemeMode;

  /** 개인 평균 포함 기본값(설정에서 변경, yd_avg_include). */
  includeInAverage: boolean;
  /** 이 게임의 포함 여부(시작 시 스냅샷 — 되돌리기 스냅샷 밖). */
  includeThisGame: boolean;
  /** 이 게임을 평균에 이미 기록했는지(1회 가드 — 스냅샷 밖). */
  avgRecorded: boolean;
  /** 기록한 값(되돌리기 정확 역산용 — 스냅샷 밖). */
  recordedAmount: number;
  /** 화면 갱신용 통계 미러(단일 출처는 localStorage yd_avg_stats). */
  avgStats: AvgStats;

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
  /** 룰 프리셋 변경. 진행 중 변경은 위험하므로 새 게임으로 리셋한다. */
  setRulePreset: (id: RulePresetId) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setResultOpen: (open: boolean) => void;
  /** 헬퍼 조언이 실제 표시됐음을 기록(useAdvice 가 non-null 일 때 호출). */
  markHelperUsed: () => void;
  /** 이번 게임 점수의 리더보드 등록 성공을 기록(재등록 방지). */
  markScoreSubmitted: () => void;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;

  /** 포함 기본 토글 변경(다음 게임부터 적용). */
  setIncludeInAverage: (on: boolean) => void;
  /** 한 버킷 통계 초기화. */
  resetAvgBucket: (mode: AvgMode, preset: RulePresetId) => void;
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

const PRESET_KEY = 'yd_rule_preset';

/** 저장된 룰 프리셋을 단일 출처로 되읽음(없거나 불명이면 기본). */
function getInitialPreset(): RulePresetId {
  try {
    const saved = localStorage.getItem(PRESET_KEY);
    if (saved && saved in RULE_PRESETS) return saved as RulePresetId;
  } catch {
    // 저장소 접근 불가 — 기본값 사용.
  }
  return DEFAULT_PRESET_ID;
}

const INITIAL_DICE = [1, 2, 3, 4, 5];
const INITIAL_PRESET = getInitialPreset();
const INITIAL_INCLUDE = loadIncludeDefault();
const INITIAL_STATS = loadStats();

/**
 * 진행 중(미종료)·미기록·순수(헬퍼·되돌리기 미사용)·floor 충족·포함 게임이면
 * 현재 부분 점수를 solo 버킷에 기록하고 저장한 새 avgStats 를 반환. 아니면 현재 avgStats.
 * newGame/setRulePreset 진입 시(리셋 직전) 호출 — setRulePreset 은 반드시 전환 전(옛 프리셋)에 호출.
 */
function commitOutgoingPartial(s: GameStore): { avgStats: AvgStats; recorded: boolean } {
  if (
    s.avgRecorded ||
    !s.includeThisGame ||
    s.helperUsedThisGame ||
    s.undoUsedThisGame ||
    isGameOver(s.card) ||               // 완료 게임은 완료 경로에서 이미 처리
    !meetsPartialFloor(filledCount(s.card))
  ) {
    return { avgStats: s.avgStats, recorded: false };
  }
  const key = bucketKey('solo', s.rulePreset);
  const score = grandTotal(s.card, s.rules);
  const next = recordPartial(loadStats(), key, score);
  saveStats(next);
  return { avgStats: next, recorded: true };
}

export const useGameStore = create<GameStore>((set, get) => ({
  rulePreset: INITIAL_PRESET,
  rules: RULE_PRESETS[INITIAL_PRESET].config,
  card: createScorecard(),
  dice: [...INITIAL_DICE],
  held: Array(DICE_COUNT).fill(false),
  rollsUsed: 0,
  settings: { helperEnabled: false, showProbabilities: true, highlightSuggestion: true },
  advisor: null,
  advisorPreset: null,
  tableStatus: 'idle',
  resultOpen: false,
  helperUsedThisGame: false,
  history: [],
  undoUsedThisGame: false,
  scoreSubmittedThisGame: false,
  theme: getInitialTheme(),

  includeInAverage: INITIAL_INCLUDE,
  includeThisGame: INITIAL_INCLUDE,
  avgRecorded: false,
  recordedAmount: 0,
  avgStats: INITIAL_STATS,

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
    const preset = get().rulePreset;
    if (!RULE_PRESETS[preset].helperSupported) return;
    if (get().tableStatus === 'loading' || get().tableStatus === 'ready') return;
    set({ tableStatus: 'loading' });
    try {
      const additional = preset === 'additional';
      const file = additional ? 'V.additional.bin' : 'V.bin';
      const expected = additional ? STATE_COUNT_ADDITIONAL : STATE_COUNT;
      const V = await loadValueTable(`${import.meta.env.BASE_URL}${file}`, expected);
      const advisor = createAdvisor(V, get().rules);
      set({ advisor, advisorPreset: preset, tableStatus: 'ready' });
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
    // 요트의 달인: 요트(50)를 이미 기록한 뒤 또 5개 같은 눈이면, 정상 채점 대신
    // 고른 빈 칸(cat)에 보너스를 적는다(주사위 점수와 무관).
    const yachtMaster =
      s.rules.multiYachtBonus &&
      s.card.scores.yacht === s.rules.yachtScore &&
      isFiveOfAKind(s.dice);
    const card = yachtMaster
      ? recordMasterYachtBonus(s.card, cat)
      : recordScore(s.card, cat, scoreDice(cat, s.dice, s.rules));
    const over = isGameOver(card);
    let avgStats = s.avgStats;
    let avgRecorded = s.avgRecorded;
    let recordedAmount = s.recordedAmount;
    // 완료 순간 1회 기록: 포함 ON·미기록·순수 게임일 때만.
    if (over && !avgRecorded && s.includeThisGame && !s.helperUsedThisGame && !s.undoUsedThisGame) {
      const score = grandTotal(card, s.rules);
      avgStats = recordCompleted(loadStats(), bucketKey('solo', s.rulePreset), score);
      avgRecorded = true;
      recordedAmount = score;
      saveStats(avgStats);
    }
    set({
      card,
      dice: [...INITIAL_DICE],
      held: Array(DICE_COUNT).fill(false),
      rollsUsed: 0,
      resultOpen: over,          // 기존 isGameOver(card) 대신 계산해 둔 over 재사용
      avgStats,
      avgRecorded,
      recordedAmount,
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
    // 완료+기록된 게임을 되돌리면 평균에서 정확히 역산.
    // (undoUsedThisGame 이 참이 되므로 재완료해도 순수성 실패로 재기록되지 않는다.)
    let avgStats = s.avgStats;
    let avgRecorded = s.avgRecorded;
    let recordedAmount = s.recordedAmount;
    if (avgRecorded && !isGameOver(prev.card)) {
      avgStats = reverseRecord(loadStats(), bucketKey('solo', s.rulePreset), s.recordedAmount);
      saveStats(avgStats);
      avgRecorded = false;
      recordedAmount = 0;
    }
    set({
      card: prev.card,
      dice: [...prev.dice],
      held: [...prev.held],
      rollsUsed: prev.rollsUsed,
      resultOpen: prev.resultOpen,
      history: s.history.slice(0, -1),
      undoUsedThisGame: true,
      avgStats,
      avgRecorded,
      recordedAmount,
    });
  },

  newGame: () => {
    const s = get();
    const { avgStats } = commitOutgoingPartial(s); // 진행 중이었으면 부분 반영
    set({
      card: createScorecard(),
      dice: [...INITIAL_DICE],
      held: Array(DICE_COUNT).fill(false),
      rollsUsed: 0,
      resultOpen: false,
      helperUsedThisGame: false,
      history: [],
      undoUsedThisGame: false,
      scoreSubmittedThisGame: false,
      avgStats,
      includeThisGame: s.includeInAverage, // 시작 고정
      avgRecorded: false,
      recordedAmount: 0,
    });
  },

  setRulePreset: (id) => {
    if (get().rulePreset === id) return;
    const s = get();
    const { avgStats } = commitOutgoingPartial(s); // 반드시 옛 프리셋 버킷에 기록 후 전환
    const preset = RULE_PRESETS[id];
    try {
      localStorage.setItem(PRESET_KEY, id);
    } catch {
      // 저장 불가 — 적용만 하고 영속화는 생략.
    }
    // 룰이 바뀌면 진행 중 점수표가 어긋나므로 새 게임으로 시작한다.
    set({
      rulePreset: id,
      rules: preset.config,
      card: createScorecard(),
      dice: [...INITIAL_DICE],
      held: Array(DICE_COUNT).fill(false),
      rollsUsed: 0,
      resultOpen: false,
      helperUsedThisGame: false,
      history: [],
      undoUsedThisGame: false,
      scoreSubmittedThisGame: false,
      // 프리셋이 바뀌면 이전 테이블/advisor 는 무효 → 리셋해 새 프리셋용으로 다시 로드.
      advisor: null,
      advisorPreset: null,
      tableStatus: 'idle',
      // 헬퍼 미지원 프리셋이면 토글을 끈다(현재는 둘 다 지원이라 사실상 그대로 유지).
      settings: preset.helperSupported
        ? get().settings
        : { ...get().settings, helperEnabled: false },
      avgStats,
      includeThisGame: s.includeInAverage,
      avgRecorded: false,
      recordedAmount: 0,
    });
  },

  setSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } });
    if (
      patch.helperEnabled &&
      get().tableStatus === 'idle' &&
      RULE_PRESETS[get().rulePreset].helperSupported
    ) {
      void get().loadTable();
    }
  },

  setResultOpen: (open) => set({ resultOpen: open }),

  markHelperUsed: () => {
    if (!get().helperUsedThisGame) set({ helperUsedThisGame: true });
  },

  markScoreSubmitted: () => {
    if (!get().scoreSubmittedThisGame) set({ scoreSubmittedThisGame: true });
  },

  setTheme: (mode) => {
    applyTheme(mode);
    set({ theme: mode });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

  setIncludeInAverage: (on) => {
    saveIncludeDefault(on);
    set({ includeInAverage: on }); // includeThisGame 은 건드리지 않음 → 다음 게임부터
  },

  resetAvgBucket: (mode, preset) => {
    const next = resetBucket(loadStats(), bucketKey(mode, preset));
    saveStats(next);
    set({ avgStats: next });
  },
}));
