import { CATEGORY_IDS } from '../core/rules';
import type { RuleConfig } from '../core/rules';
import { grandTotal, isCategoryFilled } from '../core/gameState';
import type { MpPlayer } from '../store/multiplayerStore';

export function ScorecardMini({
  player,
  rules,
  current,
  me,
  selected,
  onClick,
}: {
  player: MpPlayer;
  rules: RuleConfig;
  current: boolean;
  me: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const total = grandTotal(player.scorecard, rules);
  const filled = CATEGORY_IDS.filter((id) => isCategoryFilled(player.scorecard, id)).length;
  const pct = (filled / CATEGORY_IDS.length) * 100;

  const cls = [
    'mini',
    current ? 'current' : '',
    selected ? 'selected' : '',
    onClick ? 'clickable' : '',
    !player.connected ? 'offline' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-pressed={onClick ? !!selected : undefined}
    >
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
