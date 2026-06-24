import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useGameStore } from '../store/gameStore';
import { selectMySeat, useMultiplayerStore } from '../store/multiplayerStore';
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
  const mySeat = useMultiplayerStore(selectMySeat);
  const selectedSeat = useMultiplayerStore((s) => s.selectedSeat);
  const selectPlayer = useMultiplayerStore((s) => s.selectPlayer);
  const leave = useMultiplayerStore((s) => s.leave);
  const error = useMultiplayerStore((s) => s.error);
  const clearError = useMultiplayerStore((s) => s.clearError);
  const loadTable = useGameStore((s) => s.loadTable);
  const board = useBoard();
  const advice = useAdvice();

  const helperAllowed = room?.helperAllowed ?? false;
  const isMyTurn =
    room?.status === 'playing' && room.currentSeat !== null && room.currentSeat === mySeat;

  // 헬퍼 허용 방이면 V 테이블 미리 로드.
  useEffect(() => {
    if (helperAllowed) void loadTable();
  }, [helperAllowed, loadTable]);

  // 방이 사라지면 홈으로.
  useEffect(() => {
    if (!room || room.status === 'abandoned') setScreen('home');
  }, [room, setScreen]);

  // 내 차례가 시작되면 선택을 해제해 내 카드로 복귀(조작·EV 일치). 차례 전환 시에만 동작하도록
  // selectedSeat 는 의존성에서 제외 — 내 차례 중 상대 미리보기 핀은 유지된다.
  useEffect(() => {
    if (isMyTurn) selectPlayer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn]);

  // 선택한 플레이어가 떠나면 따라가기(내 차례/현재 차례)로 복귀.
  useEffect(() => {
    if (selectedSeat != null && !players.some((p) => p.seat === selectedSeat)) selectPlayer(null);
  }, [selectedSeat, players, selectPlayer]);

  if (!room) return null;
  const finished = room.status === 'finished';

  // 점수표로 보여줄 좌석: 선택이 있으면 그 좌석, 없으면 현재 차례를 따라간다.
  const displaySeat = selectedSeat ?? room.currentSeat;
  const viewPlayer = players.find((p) => p.seat === displaySeat) ?? null;
  // 현재 차례(라이브)와 다른 플레이어를 핀했을 때만 읽기전용 뷰 카드로 표시.
  const isViewingOther =
    selectedSeat != null && selectedSeat !== room.currentSeat && viewPlayer != null;

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
          <div className="mp-active-label">
            {viewPlayer ? `${viewPlayer.displayName} 님의 점수표` : '점수표'}
            {isViewingOther && <span className="mp-view-tag">상대 · 읽기전용</span>}
          </div>
          {isViewingOther ? (
            <Scorecard advice={null} viewCard={viewPlayer!.scorecard} />
          ) : (
            <Scorecard advice={advice} />
          )}
        </div>
      </div>

      <div className="minis">
        {players.map((p) => (
          <ScorecardMini
            key={p.id}
            player={p}
            current={room.status === 'playing' && room.currentSeat === p.seat}
            me={p.userId === myUserId}
            selected={p.seat === displaySeat}
            onClick={() => selectPlayer(p.seat === selectedSeat ? null : p.seat)}
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
