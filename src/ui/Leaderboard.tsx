// 리더보드 페이지(홈에서 진입). 통합 단일 Top10 — 모드 배지로 솔로/멀티/데스크톱 구분.
import { useEffect, useState } from 'react';
import { fetchTopScores, type LbEntry } from '../lib/leaderboard';
import { Header } from './Header';

const MODE_LABEL: Record<string, string> = { solo: '솔로', multi: '멀티', desktop: '데스크톱' };

export function Leaderboard() {
  const [entries, setEntries] = useState<LbEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchTopScores()
      .then((rows) => {
        if (alive) setEntries(rows);
      })
      .catch((e) => {
        if (alive) setError((e as { message?: string })?.message ?? '불러오지 못했습니다.');
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="app">
      <Header title="🏆 리더보드" subtitle="헬퍼 없이 달성한 Top 10" showHome />

      <div className="lb-page">
        {error && <div className="mp-error">{error}</div>}
        {!entries && !error && <div className="lb-empty">불러오는 중…</div>}
        {entries && entries.length === 0 && (
          <div className="lb-empty">아직 등록된 점수가 없습니다. 첫 기록을 남겨보세요!</div>
        )}
        {entries && entries.length > 0 && (
          <div className="mp-ranking lb-list">
            {entries.map((e, i) => (
              <div key={i} className={`mpr-row ${i === 0 ? 'win' : ''}`}>
                <span className="mpr-rank">{i + 1}</span>
                <span className="mpr-name">
                  {e.nickname}
                  <span className="lb-mode">{MODE_LABEL[e.mode] ?? e.mode}</span>
                </span>
                <b className="mpr-total">{e.score}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
