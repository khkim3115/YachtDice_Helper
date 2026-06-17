import { CATEGORY_IDS, DEFAULT_RULES } from '../core/rules';
import { grandTotal, isCategoryFilled } from '../core/gameState';
import type { MpPlayer } from '../store/multiplayerStore';

export function ScorecardMini({
  player,
  current,
  me,
}: {
  player: MpPlayer;
  current: boolean;
  me: boolean;
}) {
  const total = grandTotal(player.scorecard, DEFAULT_RULES);
  const filled = CATEGORY_IDS.filter((id) => isCategoryFilled(player.scorecard, id)).length;
  const pct = (filled / CATEGORY_IDS.length) * 100;

  const cls = ['mini', current ? 'current' : '', !player.connected ? 'offline' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      <div className="mini-head">
        <span className="mini-name">
          {player.displayName}
          {me && ' (나)'}
        </span>
        <span className="mini-total">{total}</span>
      </div>
      <div className="mini-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="mini-foot">
        <span>{filled} / 12</span>
        {current && <span className="mini-turn">차례</span>}
        {!player.connected && <span className="mini-off">오프라인</span>}
      </div>
    </div>
  );
}
