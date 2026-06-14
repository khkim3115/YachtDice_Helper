import { CATEGORY_IDS, CATEGORY_META } from '../core/rules';
import type { CategoryId } from '../core/rules';
import { isCategoryFilled, upperBonus, upperSubtotal } from '../core/gameState';
import { scoreDice } from '../core/scoring';
import type { Advice, PerCategoryAdvice } from '../engine/advisor';
import { useGameStore } from '../store/gameStore';

const UPPER_IDS = CATEGORY_IDS.filter((id) => CATEGORY_META[id].section === 'upper');
const LOWER_IDS = CATEGORY_IDS.filter((id) => CATEGORY_META[id].section === 'lower');

export function Scorecard({ advice }: { advice: Advice | null }) {
  const card = useGameStore((s) => s.card);
  const dice = useGameStore((s) => s.dice);
  const rollsUsed = useGameStore((s) => s.rollsUsed);
  const rules = useGameStore((s) => s.rules);
  const helperEnabled = useGameStore((s) => s.settings.helperEnabled);
  const highlight = useGameStore((s) => s.settings.highlightSuggestion);
  const assign = useGameStore((s) => s.assign);
  const gameOver = useGameStore((s) => s.gameOver());

  const rolled = rollsUsed > 0;
  const rerollsLeft = 3 - rollsUsed;
  const perCat = new Map<CategoryId, PerCategoryAdvice>();
  advice?.perCategory.forEach((p) => perCat.set(p.category, p));

  const recommendId =
    advice && highlight && advice.recommendScoreNow ? advice.bestCategory : null;

  const sub = upperSubtotal(card);
  const bonus = upperBonus(card, rules);
  const bonusPct = Math.min(100, (sub / rules.upperBonusThreshold) * 100);

  function Row({ id }: { id: CategoryId }) {
    const meta = CATEGORY_META[id];
    const filled = isCategoryFilled(card, id);
    const canAssign = rolled && !gameOver && !filled;
    const preview = rolled ? scoreDice(id, dice, rules) : null;
    const adv = perCat.get(id);
    const showEv = !!adv && helperEnabled && rolled && rerollsLeft > 0 && !filled;

    const cls = ['sc-row', filled ? 'filled' : 'open', recommendId === id ? 'recommend' : '']
      .filter(Boolean)
      .join(' ');

    return (
      <div
        className={cls}
        onClick={!filled && !gameOver ? () => assign(id) : undefined}
        role={canAssign ? 'button' : undefined}
      >
        <div className="sc-name">
          <span className="ko">{meta.ko}</span>
          <span className="en">{meta.en}</span>
          {recommendId === id && <span className="sc-badge">추천</span>}
        </div>
        <div className="sc-value">
          {showEv && (
            <span className="sc-ev">
              EV {adv!.evIfReroll.toFixed(1)}
              {adv!.delta > 0.5 && <span className="up"> ▲+{adv!.delta.toFixed(1)}</span>}
            </span>
          )}
          {filled ? (
            <span className="sc-points locked">{card.scores[id]}</span>
          ) : preview === null ? (
            <span className="sc-empty">–</span>
          ) : (
            <span className={`sc-points ${preview === 0 ? 'zero' : ''}`}>{preview}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="scorecard">
      <div className="sc-section-title">상단 (보너스 대상)</div>
      {UPPER_IDS.map((id) => (
        <Row key={id} id={id} />
      ))}

      <div className="sc-summary">
        <div className="bonus-bar">
          <div style={{ width: `${bonusPct}%` }} />
        </div>
        <div className="summary-line">
          <span>
            상단 합 <b>{sub}</b> / {rules.upperBonusThreshold}
          </span>
          <span>
            {bonus > 0 ? (
              <b style={{ color: 'var(--good)' }}>보너스 +{rules.upperBonusAmount} 달성</b>
            ) : (
              <>보너스까지 {Math.max(0, rules.upperBonusThreshold - sub)}점</>
            )}
          </span>
        </div>
      </div>

      <div className="sc-section-title">하단</div>
      {LOWER_IDS.map((id) => (
        <Row key={id} id={id} />
      ))}
    </div>
  );
}
