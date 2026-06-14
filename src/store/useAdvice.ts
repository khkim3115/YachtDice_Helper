import { useMemo } from 'react';
import { ROLLS_PER_TURN } from '../core/rules';
import { isGameOver } from '../core/gameState';
import type { Advice } from '../engine/advisor';
import { useGameStore } from './gameStore';

/** 현재 상태에 대한 헬퍼 조언(메모이즈). 헬퍼 OFF·테이블 미로드·미굴림 시 null. */
export function useAdvice(): Advice | null {
  const advisor = useGameStore((s) => s.advisor);
  const card = useGameStore((s) => s.card);
  const dice = useGameStore((s) => s.dice);
  const rollsUsed = useGameStore((s) => s.rollsUsed);
  const helperEnabled = useGameStore((s) => s.settings.helperEnabled);
  const tableStatus = useGameStore((s) => s.tableStatus);

  return useMemo(() => {
    if (!helperEnabled || tableStatus !== 'ready' || !advisor) return null;
    if (rollsUsed === 0 || isGameOver(card)) return null;
    return advisor.advise(card, dice, ROLLS_PER_TURN - rollsUsed);
  }, [advisor, card, dice, rollsUsed, helperEnabled, tableStatus]);
}
