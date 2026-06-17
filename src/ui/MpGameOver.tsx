import { DEFAULT_RULES } from '../core/rules';
import { grandTotal } from '../core/gameState';
import { useAppStore } from '../store/appStore';
import { useMultiplayerStore } from '../store/multiplayerStore';

export function MpGameOver() {
  const setScreen = useAppStore((s) => s.setScreen);
  const room = useMultiplayerStore((s) => s.room);
  const players = useMultiplayerStore((s) => s.players);
  const myUserId = useMultiplayerStore((s) => s.myUserId);
  const leave = useMultiplayerStore((s) => s.leave);
  if (!room) return null;

  const ranked = players
    .map((p) => ({ p, total: grandTotal(p.scorecard, DEFAULT_RULES) }))
    .sort((a, b) => b.total - a.total);

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

        <button className="again-btn" onClick={() => void onHome()}>
          홈으로
        </button>
      </div>
    </div>
  );
}
