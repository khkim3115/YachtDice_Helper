import { ROLLS_PER_TURN } from '../core/rules';
import type { Advice } from '../engine/advisor';
import { useBoard } from '../store/useBoard';
import { Die } from './Die';

export function DiceTray({ advice }: { advice: Advice | null }) {
  const { dice, held, rollsUsed, highlightSuggestion, canRoll, canReroll, gameOver, readOnly, roll, toggleHold } =
    useBoard();

  const active = rollsUsed > 0;
  const suggestReroll = !!advice && highlightSuggestion && !advice.recommendScoreNow;

  let hint = '';
  if (gameOver) hint = '게임 종료!';
  else if (readOnly) hint = '상대 차례 — 관전 중입니다';
  else if (rollsUsed === 0) hint = '주사위를 굴려서 시작하세요';
  else if (rollsUsed === ROLLS_PER_TURN) hint = '점수표에서 기록할 칸을 선택하세요';
  else hint = '고정할 주사위를 누르고 다시 굴리세요';

  const rollLabel = rollsUsed === 0 ? '🎲 주사위 굴리기' : '다시 굴리기';

  return (
    <div className="tray">
      <div className="dice-row">
        {dice.map((v, i) => (
          <Die
            key={i}
            value={v}
            active={active}
            held={held[i]}
            suggested={suggestReroll && advice!.holdMask[i]}
            clickable={canReroll}
            animKey={held[i] ? `h${i}` : `${rollsUsed}-${i}-${v}`}
            onClick={() => toggleHold(i)}
          />
        ))}
      </div>

      <div className="controls">
        <button className="roll-btn" disabled={!canRoll} onClick={roll}>
          {rollLabel}
        </button>
        <div className="roll-dots" aria-label={`굴림 ${rollsUsed}/${ROLLS_PER_TURN}`}>
          {Array.from({ length: ROLLS_PER_TURN }, (_, i) => (
            <span key={i} className={`dot ${i < rollsUsed ? 'used' : ''}`} />
          ))}
        </div>
        <div className="hint">{hint}</div>
      </div>
    </div>
  );
}
