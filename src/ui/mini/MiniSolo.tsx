// 축소 싱글플레이 — gameStore + Die 재사용. 헬퍼 없음.
import { CATEGORY_IDS, CATEGORY_META } from '../../core/rules';
import { grandTotal, isCategoryFilled } from '../../core/gameState';
import { scoreDice } from '../../core/scoring';
import { useGameStore } from '../../store/gameStore';
import { Die } from '../Die';

export function MiniSolo() {
  const dice = useGameStore((s) => s.dice);
  const held = useGameStore((s) => s.held);
  const rollsUsed = useGameStore((s) => s.rollsUsed);
  const card = useGameStore((s) => s.card);
  const rules = useGameStore((s) => s.rules);
  const roll = useGameStore((s) => s.roll);
  const toggleHold = useGameStore((s) => s.toggleHold);
  const assign = useGameStore((s) => s.assign);
  const newGame = useGameStore((s) => s.newGame);
  const canRoll = useGameStore((s) => s.canRoll());
  const canReroll = useGameStore((s) => s.canReroll());
  const gameOver = useGameStore((s) => s.gameOver());
  const rerollsLeft = useGameStore((s) => s.rerollsLeft());

  const rolled = rollsUsed > 0;
  const total = grandTotal(card, rules);

  return (
    <div className="mini-game">
      <div className="mini-dice">
        {dice.map((v, i) => (
          <Die
            key={i}
            value={v}
            active={rolled}
            held={held[i]}
            suggested={false}
            clickable={canReroll}
            animKey={`${i}-${v}-${rollsUsed}`}
            onClick={() => toggleHold(i)}
          />
        ))}
      </div>

      <button
        className="mini-roll"
        onClick={gameOver ? newGame : roll}
        disabled={!gameOver && !canRoll}
      >
        {gameOver ? '다시 시작' : rollsUsed === 0 ? '굴리기' : `리롤 (${rerollsLeft})`}
      </button>

      <div className="mini-card">
        {CATEGORY_IDS.map((id) => {
          const filled = isCategoryFilled(card, id);
          const preview = !filled && rolled && !gameOver ? scoreDice(id, dice, rules) : null;
          return (
            <button
              key={id}
              className={`mini-cat ${filled ? 'filled' : ''}`}
              disabled={filled || !rolled || gameOver}
              onClick={() => assign(id)}
            >
              <span className="k">{CATEGORY_META[id].ko}</span>
              <span className="v">
                {filled ? (card.scores[id] ?? 0) : preview === null ? '·' : preview}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mini-foot-total">합계 {total}</div>
    </div>
  );
}
