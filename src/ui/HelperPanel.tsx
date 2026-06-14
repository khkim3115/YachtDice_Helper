import type { ReactNode } from 'react';
import { CATEGORY_META } from '../core/rules';
import type { Advice } from '../engine/advisor';
import { useGameStore } from '../store/gameStore';

export function HelperPanel({ advice }: { advice: Advice | null }) {
  const tableStatus = useGameStore((s) => s.tableStatus);
  const rollsUsed = useGameStore((s) => s.rollsUsed);
  const dice = useGameStore((s) => s.dice);
  const showProbabilities = useGameStore((s) => s.settings.showProbabilities);
  const gameOver = useGameStore((s) => s.gameOver());

  let body: ReactNode;

  if (tableStatus === 'loading') {
    body = <div className="helper-loading">헬퍼 데이터 로딩 중…</div>;
  } else if (tableStatus === 'error') {
    body = <div className="helper-loading">헬퍼 데이터를 불러오지 못했습니다. (V.bin 확인)</div>;
  } else if (gameOver) {
    body = <div className="helper-off">게임이 끝났습니다.</div>;
  } else if (!advice || rollsUsed === 0) {
    body = <div className="helper-off">주사위를 굴리면 최적의 수를 추천해 드려요.</div>;
  } else {
    const keptValues = dice.filter((_, i) => advice.holdMask[i]);
    const keptText = keptValues.length ? keptValues.join(', ') : '모두 다시';
    const bestKo = CATEGORY_META[advice.bestCategory].ko;

    body = (
      <>
        {advice.recommendScoreNow ? (
          <div className="banner score">
            <span className="icon">✅</span>
            <span className="text">
              <span className="main">
                지금 <em>{bestKo}</em>에 기록
              </span>
              <span className="sub">현재 {advice.bestCategoryScoreNow}점</span>
            </span>
          </div>
        ) : (
          <div className="banner reroll">
            <span className="icon">🎲</span>
            <span className="text">
              <span className="main">
                <em>{keptText}</em> 보관하고 다시 굴리기
              </span>
              <span className="sub">기대 향상 +{advice.evGainFromReroll.toFixed(1)}점</span>
            </span>
          </div>
        )}

        <div className="expected">
          <span>최적 플레이 시 예상 최종 점수</span>
          <b>약 {Math.round(advice.expectedFinalScore)}점</b>
        </div>

        {showProbabilities && (
          <div className="combos">
            {advice.comboProbs.map((c) => {
              const pct = Math.round(c.prob * 100);
              return (
                <div className="combo" key={c.combo}>
                  <span>{c.label}</span>
                  <span className="cbar">
                    <div style={{ width: `${pct}%` }} />
                  </span>
                  <span className="cpct">{pct}%</span>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="panel">
      <h2>헬퍼 추천</h2>
      {body}
    </div>
  );
}
