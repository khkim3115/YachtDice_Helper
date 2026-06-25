import { useMemo } from 'react';
import { ROLLS_PER_TURN } from '../core/rules';
import { isGameOver } from '../core/gameState';
import type { Advice } from '../engine/advisor';
import { useGameStore } from './gameStore';
import { useBoard } from './useBoard';

/** 현재 보드(솔로/멀티)에 대한 헬퍼 조언(메모이즈). 헬퍼 OFF·테이블 미로드·미굴림 시 null. */
export function useAdvice(): Advice | null {
  const advisor = useGameStore((s) => s.advisor);
  const advisorPreset = useGameStore((s) => s.advisorPreset);
  const board = useBoard();
  const { helperEnabled, tableStatus, rollsUsed, gameOver, card, dice, rulePreset } = board;

  return useMemo(() => {
    if (!helperEnabled || tableStatus !== 'ready' || !advisor) return null;
    if (advisorPreset !== rulePreset) return null; // 로드된 테이블이 보드 프리셋과 다르면 미사용
    if (rollsUsed === 0 || gameOver || isGameOver(card)) return null;
    return advisor.advise(card, dice, ROLLS_PER_TURN - rollsUsed);
  }, [advisor, advisorPreset, rulePreset, tableStatus, helperEnabled, rollsUsed, gameOver, card, dice]);
}
