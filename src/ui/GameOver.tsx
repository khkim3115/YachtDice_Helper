import { useState } from 'react';
import { CATEGORY_IDS, CATEGORY_META } from '../core/rules';
import type { CategoryId } from '../core/rules';
import {
  grandTotal,
  isMasterCell,
  lowerFourBonus,
  lowerSubtotal,
  masterBonusTotal,
  upperBonus,
  upperSubtotal,
} from '../core/gameState';
import { useGameStore } from '../store/gameStore';
import { SubmitScoreModal } from './SubmitScoreModal';

/** 기본 룰 최적 플레이 평균(사전계산 결과, src/precompute 출력). */
const OPTIMAL_AVG = 192;
const UPPER_IDS = CATEGORY_IDS.filter((id) => CATEGORY_META[id].section === 'upper');
const LOWER_IDS = CATEGORY_IDS.filter((id) => CATEGORY_META[id].section === 'lower');

export function GameOver() {
  const card = useGameStore((s) => s.card);
  const rules = useGameStore((s) => s.rules);
  const rulePreset = useGameStore((s) => s.rulePreset);
  const newGame = useGameStore((s) => s.newGame);
  const setResultOpen = useGameStore((s) => s.setResultOpen);
  const helperUsedThisGame = useGameStore((s) => s.helperUsedThisGame);
  const undoUsedThisGame = useGameStore((s) => s.undoUsedThisGame);
  const scoreSubmittedThisGame = useGameStore((s) => s.scoreSubmittedThisGame);
  const markScoreSubmitted = useGameStore((s) => s.markScoreSubmitted);
  const [submitOpen, setSubmitOpen] = useState(false);

  const total = grandTotal(card, rules);
  const sub = upperSubtotal(card);
  const bonus = upperBonus(card, rules);
  const lower = lowerSubtotal(card);
  const masterBonus = masterBonusTotal(card, rules);
  const lowerFour = lowerFourBonus(card, rules);
  // 추가 룰 게임은 최적 평균(기본 룰 전제)과 비교하지 않는다.
  const isAdditional = rules.multiYachtBonus || rules.lowerFourBonus;

  const diff = total - OPTIMAL_AVG;
  const compare = isAdditional
    ? '추가 룰 게임'
    : diff >= 0
      ? `최적 평균(약 ${OPTIMAL_AVG}점)보다 +${diff}점! 🎉`
      : `최적 평균(약 ${OPTIMAL_AVG}점)까지 ${-diff}점`;

  const Row = ({ id }: { id: CategoryId }) => {
    const master = isMasterCell(card, id);
    const score = master ? rules.multiYachtBonusAmount : card.scores[id] ?? 0;
    return (
      <div className="go-row">
        <span className="go-cat">
          {CATEGORY_META[id].ko}
          {master && <span className="go-master"> 달인</span>}
        </span>
        <b className={!master && score === 0 ? 'zero' : ''}>{score}</b>
      </div>
    );
  };

  return (
    <div className="gameover">
      <div className="gameover-card">
        <h2>게임 종료</h2>
        <div className="final-score">{total}</div>
        <div className="compare">{compare}</div>

        <div className="go-detail">
          <div className="go-col">
            <div className="go-col-title">상단</div>
            {UPPER_IDS.map((id) => (
              <Row key={id} id={id} />
            ))}
            <div className="go-row bonus">
              <span className="go-cat">보너스</span>
              <b className={bonus === 0 ? 'zero' : ''}>{bonus > 0 ? `+${bonus}` : 0}</b>
            </div>
            <div className="go-row subtotal">
              <span className="go-cat">상단 합</span>
              <b>{sub + bonus}</b>
            </div>
          </div>
          <div className="go-col">
            <div className="go-col-title">하단</div>
            {LOWER_IDS.map((id) => (
              <Row key={id} id={id} />
            ))}
            <div className="go-row subtotal">
              <span className="go-cat">하단 합</span>
              <b>{lower}</b>
            </div>
          </div>
        </div>

        {(masterBonus > 0 || lowerFour > 0) && (
          <div className="go-extra">
            {masterBonus > 0 && (
              <div className="go-row bonus">
                <span className="go-cat">요트의 달인</span>
                <b style={{ color: 'var(--gold)' }}>+{masterBonus}</b>
              </div>
            )}
            {lowerFour > 0 && (
              <div className="go-row bonus">
                <span className="go-cat">요트도 포커처럼</span>
                <b style={{ color: 'var(--good)' }}>+{lowerFour}</b>
              </div>
            )}
          </div>
        )}

        {!helperUsedThisGame &&
          !undoUsedThisGame &&
          (scoreSubmittedThisGame ? (
            <div className="lb-registered">✓ 리더보드 등록 완료</div>
          ) : (
            <button className="lb-register-btn" onClick={() => setSubmitOpen(true)}>
              🏆 리더보드 등록{isAdditional ? ' · 추가 룰' : ''}
            </button>
          ))}

        <div className="go-actions">
          <button className="ghost-btn" onClick={() => setResultOpen(false)}>
            점수표 보기
          </button>
          <button className="again-btn" onClick={newGame}>
            다시 하기
          </button>
        </div>
      </div>

      {submitOpen && (
        <SubmitScoreModal
          score={total}
          mode="solo"
          rulePreset={rulePreset}
          defaultName={savedName()}
          onClose={() => setSubmitOpen(false)}
          onSubmitted={markScoreSubmitted}
        />
      )}
    </div>
  );
}

/** 마지막으로 쓴 닉네임(멀티와 공유). 사용 불가 환경이면 빈 문자열. */
function savedName(): string {
  try {
    return localStorage.getItem('yd_mp_name') ?? '';
  } catch {
    return '';
  }
}
