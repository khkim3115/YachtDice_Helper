// 모드 무관 보드 어댑터: 솔로(gameStore) / 멀티(multiplayerStore)를 동일한 shape 로 제공.
// 기존 컴포넌트(DiceTray·Scorecard·HelperPanel)는 useGameStore 대신 useBoard 만 본다.

import type { CategoryId, RuleConfig } from '../core/rules';
import { DEFAULT_RULES, ROLLS_PER_TURN } from '../core/rules';
import type { Scorecard } from '../core/gameState';
import { createScorecard, isGameOver } from '../core/gameState';
import { useAppStore } from './appStore';
import type { TableStatus } from './gameStore';
import { useGameStore } from './gameStore';
import { useMultiplayerStore } from './multiplayerStore';

const PLACEHOLDER_DICE = [1, 2, 3, 4, 5];
const PLACEHOLDER_HELD = [false, false, false, false, false];

export interface BoardView {
  card: Scorecard;
  dice: number[];
  held: boolean[];
  rollsUsed: number;
  rules: RuleConfig;
  canRoll: boolean;
  canReroll: boolean;
  /** 보드 상호작용 불가(솔로: 게임 종료 / 멀티: 게임 종료). */
  gameOver: boolean;
  /** 내 차례가 아니라 조작 불가(관전). 솔로는 항상 false. */
  readOnly: boolean;
  helperEnabled: boolean;
  showProbabilities: boolean;
  highlightSuggestion: boolean;
  tableStatus: TableStatus;
  roll: () => void;
  toggleHold: (i: number) => void;
  assign: (cat: CategoryId) => void;
  /** 되돌리기(솔로 전용). 멀티에서는 null → 버튼 미표시. */
  undo: (() => void) | null;
  /** 되돌리기 가능 여부(멀티는 항상 false). */
  canUndo: boolean;
}

export function useBoard(): BoardView {
  const screen = useAppStore((s) => s.screen);

  // 디스플레이 설정은 두 모드 공통으로 솔로 설정을 따른다.
  const settings = useGameStore((s) => s.settings);
  const tableStatus = useGameStore((s) => s.tableStatus);

  // 솔로 슬라이스
  const soloCard = useGameStore((s) => s.card);
  const soloDice = useGameStore((s) => s.dice);
  const soloHeld = useGameStore((s) => s.held);
  const soloRollsUsed = useGameStore((s) => s.rollsUsed);
  const soloRules = useGameStore((s) => s.rules);
  const soloRoll = useGameStore((s) => s.roll);
  const soloToggleHold = useGameStore((s) => s.toggleHold);
  const soloAssign = useGameStore((s) => s.assign);
  const soloUndo = useGameStore((s) => s.undo);
  const soloCanRoll = useGameStore((s) => s.canRoll());
  const soloCanReroll = useGameStore((s) => s.canReroll());
  const soloCanUndo = useGameStore((s) => s.canUndo());
  const soloGameOver = useGameStore((s) => s.gameOver());

  // 멀티 슬라이스
  const mpRoom = useMultiplayerStore((s) => s.room);
  const mpPlayers = useMultiplayerStore((s) => s.players);
  const mpMyUserId = useMultiplayerStore((s) => s.myUserId);
  const mpRoll = useMultiplayerStore((s) => s.rollDice);
  const mpSetHeld = useMultiplayerStore((s) => s.setHeld);
  const mpAssign = useMultiplayerStore((s) => s.assignCategory);

  if (screen === 'mpgame' && mpRoom) {
    const me = mpPlayers.find((p) => p.userId === mpMyUserId);
    const mySeat = me ? me.seat : null;
    const active =
      mpRoom.currentSeat === null
        ? null
        : mpPlayers.find((p) => p.seat === mpRoom.currentSeat) ?? null;
    const isMyTurn = mpRoom.status === 'playing' && mpRoom.currentSeat === mySeat && mySeat !== null;
    const finished = mpRoom.status !== 'playing';
    const dice = mpRoom.dice.length === 5 ? mpRoom.dice : PLACEHOLDER_DICE;
    const held = mpRoom.held.length === 5 ? mpRoom.held : PLACEHOLDER_HELD;

    return {
      card: active?.scorecard ?? createScorecard(),
      dice,
      held,
      rollsUsed: mpRoom.rollsUsed,
      rules: DEFAULT_RULES,
      canRoll: isMyTurn && mpRoom.rollsUsed < ROLLS_PER_TURN,
      canReroll: isMyTurn && mpRoom.rollsUsed > 0 && mpRoom.rollsUsed < ROLLS_PER_TURN,
      gameOver: finished,
      readOnly: !isMyTurn,
      helperEnabled: mpRoom.helperAllowed && isMyTurn,
      showProbabilities: settings.showProbabilities,
      highlightSuggestion: settings.highlightSuggestion,
      tableStatus,
      roll: () => {
        void mpRoll();
      },
      toggleHold: (i) => {
        const next = (held.length === 5 ? held : PLACEHOLDER_HELD).slice();
        next[i] = !next[i];
        void mpSetHeld(next);
      },
      assign: (cat) => {
        void mpAssign(cat);
      },
      undo: null,
      canUndo: false,
    };
  }

  // 솔로(기본)
  return {
    card: soloCard,
    dice: soloDice,
    held: soloHeld,
    rollsUsed: soloRollsUsed,
    rules: soloRules,
    canRoll: soloCanRoll,
    canReroll: soloCanReroll,
    gameOver: soloGameOver || isGameOver(soloCard),
    readOnly: false,
    helperEnabled: settings.helperEnabled,
    showProbabilities: settings.showProbabilities,
    highlightSuggestion: settings.highlightSuggestion,
    tableStatus,
    roll: soloRoll,
    toggleHold: soloToggleHold,
    assign: soloAssign,
    undo: soloUndo,
    canUndo: soloCanUndo,
  };
}
