import { useState } from 'react';
import { RULE_PRESETS } from '../core/rules';
import { grandTotal } from '../core/gameState';
import { useAppStore } from '../store/appStore';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { SubmitScoreModal } from './SubmitScoreModal';

export function MpGameOver() {
  const setScreen = useAppStore((s) => s.setScreen);
  const room = useMultiplayerStore((s) => s.room);
  const players = useMultiplayerStore((s) => s.players);
  const myUserId = useMultiplayerStore((s) => s.myUserId);
  const leave = useMultiplayerStore((s) => s.leave);
  const [submitOpen, setSubmitOpen] = useState(false);
  // 이번 게임 점수를 이미 등록했는지(재등록 방지). MpGameOver 는 "홈으로" 전까지 유지되므로 local state 로 충분.
  const [submitted, setSubmitted] = useState(false);
  if (!room) return null;

  const rules = RULE_PRESETS[room.rulePreset].config;
  const ranked = players
    .map((p) => ({ p, total: grandTotal(p.scorecard, rules) }))
    .sort((a, b) => b.total - a.total);

  // 헬퍼 비허용 방에서만 내 점수를 리더보드에 등록(규칙별 보드로 분리 — PR3).
  const me = ranked.find((r) => r.p.userId === myUserId);
  const canRegister = !room.helperAllowed && !!me;

  async function onHome() {
    await leave();
    setScreen('home');
  }

  return (
    <div className="gameover">
      <div className="gameover-card">
        <h2>게임 종료</h2>
        <div className="final-score">{ranked[0]?.total ?? 0}</div>
        <div className="compare">
          {room.isTie ? '무승부!' : `🏆 ${ranked[0]?.p.displayName ?? ''} 승리`}
        </div>

        <div className="mp-ranking">
          {ranked.map((r, i) => (
            <div
              key={r.p.id}
              className={`mpr-row ${i === 0 && !room.isTie ? 'win' : ''} ${
                r.p.userId === myUserId ? 'me' : ''
              }`}
            >
              <span className="mpr-rank">{i + 1}</span>
              <span className="mpr-name">
                {r.p.displayName}
                {r.p.userId === myUserId && ' (나)'}
              </span>
              <b className="mpr-total">{r.total}</b>
            </div>
          ))}
        </div>

        {canRegister &&
          (submitted ? (
            <div className="lb-registered">✓ 리더보드 등록 완료</div>
          ) : (
            <button className="lb-register-btn" onClick={() => setSubmitOpen(true)}>
              🏆 리더보드 등록 (내 점수 {me!.total})
            </button>
          ))}

        <button className="again-btn" onClick={() => void onHome()}>
          홈으로
        </button>
      </div>

      {submitOpen && me && (
        <SubmitScoreModal
          score={me.total}
          mode="multi"
          rulePreset={room.rulePreset}
          defaultName={me.p.displayName}
          onClose={() => setSubmitOpen(false)}
          onSubmitted={() => setSubmitted(true)}
        />
      )}
    </div>
  );
}
