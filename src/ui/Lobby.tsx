import { useEffect } from 'react';
import { RULE_PRESETS } from '../core/rules';
import { useAppStore } from '../store/appStore';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { Header } from './Header';
import { ChatPanel } from './ChatPanel';

export function Lobby() {
  const setScreen = useAppStore((s) => s.setScreen);
  const room = useMultiplayerStore((s) => s.room);
  const players = useMultiplayerStore((s) => s.players);
  const myUserId = useMultiplayerStore((s) => s.myUserId);
  const startGame = useMultiplayerStore((s) => s.startGame);
  const leave = useMultiplayerStore((s) => s.leave);
  const error = useMultiplayerStore((s) => s.error);

  // 상태 전환: 시작되면 게임 화면 / 방이 사라지면 홈.
  useEffect(() => {
    if (!room || room.status === 'abandoned') {
      setScreen('home');
    } else if (room.status === 'playing' || room.status === 'finished') {
      setScreen('mpgame');
    }
  }, [room, setScreen]);

  if (!room) return null;

  const isHost = room.hostId === myUserId;
  const canStart = isHost && players.length >= 2;
  const slots = Array.from({ length: room.maxPlayers }, (_, i) => players.find((p) => p.seat === i));

  async function onLeave() {
    await leave();
    setScreen('home');
  }

  return (
    <div className="app">
      <Header title="대기실" subtitle="Lobby">
        <button className="ghost-btn lobby-leave" onClick={onLeave}>
          나가기
        </button>
      </Header>

      <div className="panel lobby">
        <div className="lobby-code">
          <span className="lc-label">초대 코드</span>
          <span className="lc-code">{room.code}</span>
          <button
            className="lc-copy"
            onClick={() => void navigator.clipboard?.writeText(room.code)}
          >
            복사
          </button>
        </div>
        <p className="lobby-hint">
          친구에게 이 코드를 알려주면 같은 방에 참여할 수 있어요. {RULE_PRESETS[room.rulePreset].ko} · 헬퍼{' '}
          {room.helperAllowed ? '허용' : '비허용'} · 최대 {room.maxPlayers}명
        </p>

        <div className="lobby-players">
          {slots.map((p, i) => (
            <div key={i} className={`lp-slot ${p ? 'filled' : 'empty'}`}>
              <span className="lp-seat">{i + 1}</span>
              {p ? (
                <>
                  <span className="lp-name">{p.displayName}</span>
                  {p.isHost && <span className="lp-host">방장</span>}
                  {p.userId === myUserId && <span className="lp-you">나</span>}
                </>
              ) : (
                <span className="lp-waiting">대기 중…</span>
              )}
            </div>
          ))}
        </div>

        {error && <div className="mp-error">{error}</div>}

        {isHost ? (
          <button className="mp-primary" disabled={!canStart} onClick={() => void startGame()}>
            {players.length < 2 ? '2명 이상 모이면 시작' : '게임 시작'}
          </button>
        ) : (
          <div className="lobby-wait">방장이 시작하기를 기다리는 중…</div>
        )}
      </div>

      <ChatPanel />
    </div>
  );
}
