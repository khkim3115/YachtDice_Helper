import { selectActivePlayer, selectMySeat, useMultiplayerStore } from '../store/multiplayerStore';

export function TurnBanner() {
  const room = useMultiplayerStore((s) => s.room);
  const active = useMultiplayerStore(selectActivePlayer);
  const mySeat = useMultiplayerStore(selectMySeat);
  if (!room) return null;

  const isMyTurn = active != null && active.seat === mySeat;
  const roundNum = Math.min(room.round + 1, 12);

  return (
    <div className={`turn-banner ${isMyTurn ? 'mine' : ''}`}>
      <span className="tb-round">라운드 {roundNum} / 12</span>
      <span className="tb-turn">
        {isMyTurn ? '🎯 당신의 차례!' : `${active?.displayName ?? '상대'} 님의 차례`}
      </span>
    </div>
  );
}
