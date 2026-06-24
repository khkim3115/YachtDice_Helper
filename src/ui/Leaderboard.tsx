// 리더보드 페이지(홈에서 진입). 규칙(기본/추가)별 Top10 — 탭으로 전환, 모드 배지로 솔로/멀티/데스크톱 구분.
import { useEffect, useState } from 'react';
import { RULE_PRESETS } from '../core/rules';
import type { RulePresetId } from '../core/rules';
import { fetchTopScores, type LbEntry } from '../lib/leaderboard';
import { Header } from './Header';

const MODE_LABEL: Record<string, string> = { solo: '솔로', multi: '멀티', desktop: '데스크톱' };
const PRESET_TABS: RulePresetId[] = ['default', 'additional'];

export function Leaderboard() {
  const [preset, setPreset] = useState<RulePresetId>('default');
  const [entries, setEntries] = useState<LbEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setEntries(null);
    setError(null);
    fetchTopScores(preset)
      .then((rows) => {
        if (alive) setEntries(rows);
      })
      .catch((e) => {
        if (alive) setError((e as { message?: string })?.message ?? '불러오지 못했습니다.');
      });
    return () => {
      alive = false;
    };
  }, [preset]);

  return (
    <div className="app">
      <Header title="🏆 리더보드" subtitle="헬퍼 없이 달성한 Top 10" showHome />

      <div className="lb-page">
        <div className="lb-tabs" role="tablist">
          {PRESET_TABS.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={preset === id}
              className={`lb-tab ${preset === id ? 'active' : ''}`}
              onClick={() => setPreset(id)}
            >
              {RULE_PRESETS[id].ko}
            </button>
          ))}
        </div>
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
