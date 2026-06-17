import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useGameStore } from '../store/gameStore';
import { selectActivePlayer, useMultiplayerStore } from '../store/multiplayerStore';
import { useAdvice } from '../store/useAdvice';
import { useBoard } from '../store/useBoard';
import { Header } from './Header';
import { DiceTray } from './DiceTray';
import { Scorecard } from './Scorecard';
import { HelperPanel } from './HelperPanel';
import { ScorecardMini } from './ScorecardMini';
import { TurnBanner } from './TurnBanner';
import { MpGameOver } from './MpGameOver';

export function MultiplayerGame() {
  const setScreen = useAppStore((s) => s.setScreen);
  const room = useMultiplayerStore((s) => s.room);
  const players = useMultiplayerStore((s) => s.players);
  const myUserId = useMultiplayerStore((s) => s.myUserId);
  const active = useMultiplayerStore(selectActivePlayer);
  const leave = useMultiplayerStore((s) => s.leave);
  const error = useMultiplayerStore((s) => s.error);
  const clearError = useMultiplayerStore((s) => s.clearError);
  const loadTable = useGameStore((s) => s.loadTable);
  const board = useBoard();
  const advice = useAdvice();

  const helperAllowed = room?.helperAllowed ?? false;

  // 헬퍼 허용 방이면 V 테이블 미리 로드.
  useEffect(() => {
    if (helperAllowed) void loadTable();
  }, [helperAllowed, loadTable]);

  // 방이 사라지면 홈으로.
  useEffect(() => {
    if (!room || room.status === 'abandoned') setScreen('home');
  }, [room, setScreen]);

  if (!room) return null;
  const finished = room.status === 'finished';

  async function onLeave() {
    await leave();
    setScreen('home');
  }

  return (
    <div className="app">
      <Header title="YACHT DICE" subtitle={`방 ${room.code}`}>
        <button className="ghost-btn lobby-leave" onClick={() => void onLeave()}>
          나가기
        </button>
      </Header>

      <TurnBanner />

      <div className="layout">
        <div className="left">
          <div className="panel">
            <DiceTray advice={advice} />
          </div>
          {board.helperEnabled && <HelperPanel advice={advice} />}
        </div>
        <div className="panel">
          <div className="mp-active-label">{active ? `${active.displayName} 님의 점수표` : '점수표'}</div>
          <Scorecard advice={advice} />
        </div>
      </div>

      <div className="minis">
        {players.map((p) => (
          <ScorecardMini
            key={p.id}
            player={p}
            current={room.status === 'playing' && room.currentSeat === p.seat}
            me={p.userId === myUserId}
          />
        ))}
      </div>

      {error && (
        <div className="mp-error toast" onClick={clearError} role="alert">
          {error}
        </div>
      )}
      {finished && <MpGameOver />}
    </div>
  );
}
