import { CATEGORY_IDS, CATEGORY_META, LOWER_FOUR_CATEGORIES } from '../core/rules';
import type { CategoryId } from '../core/rules';
import type { Scorecard as ScorecardData } from '../core/gameState';
import {
  isCategoryFilled,
  isMasterCell,
  lowerFourCompleted,
  upperBonus,
  upperSubtotal,
} from '../core/gameState';
import { scoreDice } from '../core/scoring';
import type { Advice, PerCategoryAdvice } from '../engine/advisor';
import { useBoard } from '../store/useBoard';

const UPPER_IDS = CATEGORY_IDS.filter((id) => CATEGORY_META[id].section === 'upper');
const LOWER_IDS = CATEGORY_IDS.filter((id) => CATEGORY_META[id].section === 'lower');

// viewCard 가 있으면 다른 플레이어 카드를 읽기전용으로 표시(주사위·EV·추천 모두 숨김).
export function Scorecard({ advice, viewCard }: { advice: Advice | null; viewCard?: ScorecardData }) {
  const board = useBoard();
  const { dice, rollsUsed, rules, helperEnabled, highlightSuggestion: highlight, assign, gameOver } = board;
  const viewing = viewCard != null;
  const card = viewCard ?? board.card;
  const readOnly = viewing || board.readOnly;
  // 요트의 달인: 빈 칸을 고르면 그 칸에 보너스 점수를 적는 모드(관전 중에는 비활성).
  const masterPick = !viewing && board.yachtMasterActive;

  const rolled = rollsUsed > 0;
  const rerollsLeft = 3 - rollsUsed;
  const perCat = new Map<CategoryId, PerCategoryAdvice>();
  advice?.perCategory.forEach((p) => perCat.set(p.category, p));

  const recommendId =
    !viewing && advice && highlight && advice.recommendScoreNow ? advice.bestCategory : null;

  const sub = upperSubtotal(card);
  const bonus = upperBonus(card, rules);
  const bonusPct = Math.min(100, (sub / rules.upperBonusThreshold) * 100);

  // 추가 룰 표시용 파생값.
  const showAdditional = rules.multiYachtBonus || rules.lowerFourBonus;
  const masterCount = card.masterCells?.length ?? 0;
  const lowerFourDone = LOWER_FOUR_CATEGORIES.filter((c) => (card.scores[c] ?? 0) > 0).length;
  const lowerFourDone4 = lowerFourCompleted(card, rules);

  function Row({ id }: { id: CategoryId }) {
    const meta = CATEGORY_META[id];
    const filled = isCategoryFilled(card, id);
    const master = isMasterCell(card, id);
    const canAssign = rolled && !gameOver && !filled && !readOnly;
    // 요트의 달인 모드에서는 빈 칸이 모두 "보너스 100점 기록" 후보가 된다.
    const preview = masterPick
      ? !filled
        ? rules.multiYachtBonusAmount
        : null
      : !viewing && rolled
        ? scoreDice(id, dice, rules)
        : null;
    const adv = perCat.get(id);
    const showEv = !viewing && !!adv && helperEnabled && rolled && rerollsLeft > 0 && !filled;

    const cls = [
      'sc-row',
      filled ? 'filled' : 'open',
      recommendId === id ? 'recommend' : '',
      masterPick && !filled ? 'master-target' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        className={cls}
        onClick={!readOnly && !filled && !gameOver ? () => assign(id) : undefined}
        role={canAssign ? 'button' : undefined}
      >
        <div className="sc-name">
          <span className="ko">{meta.ko}</span>
          <span className="en">{meta.en}</span>
          {recommendId === id && <span className="sc-badge">추천</span>}
          {master && <span className="sc-badge master">달인</span>}
        </div>
        <div className="sc-value">
          {showEv && (
            <span className="sc-ev">
              EV {adv!.evIfReroll.toFixed(1)}
              {adv!.delta > 0.5 && <span className="up"> ▲+{adv!.delta.toFixed(1)}</span>}
            </span>
          )}
          {filled ? (
            <>
              <span className="sc-check" aria-label="기록됨">
                ✓
              </span>
              <span className="sc-points locked">
                {master ? rules.multiYachtBonusAmount : card.scores[id]}
              </span>
            </>
          ) : preview === null ? (
            <span className="sc-empty">–</span>
          ) : (
            <span className={`sc-points ${masterPick ? 'master' : preview === 0 ? 'zero' : ''}`}>
              {masterPick ? `+${preview}` : preview}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="scorecard">
      {masterPick && (
        <div className="master-hint">
          🎯 요트의 달인! 빈 칸을 골라 보너스 +{rules.multiYachtBonusAmount}점을 기록하세요.
        </div>
      )}
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

      {showAdditional && (
        <div className="sc-summary sc-extra">
          {rules.lowerFourBonus && (
            <div className="summary-line">
              <span>요트도 포커처럼 ({lowerFourDone}/4)</span>
              <span>
                {lowerFourDone4 ? (
                  <b style={{ color: 'var(--good)' }}>+{rules.lowerFourBonusAmount} 달성</b>
                ) : (
                  <>4종 완성 시 +{rules.lowerFourBonusAmount}</>
                )}
              </span>
            </div>
          )}
          {rules.multiYachtBonus && masterCount > 0 && (
            <div className="summary-line">
              <span>요트의 달인</span>
              <span>
                <b style={{ color: 'var(--gold)' }}>
                  +{rules.multiYachtBonusAmount} ×{masterCount} = +
                  {rules.multiYachtBonusAmount * masterCount}
                </b>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
