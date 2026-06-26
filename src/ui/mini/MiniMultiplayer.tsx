// 축소 멀티플레이 — multiplayerStore(서버 권위) 재사용. 헬퍼 없음.
import { useState } from 'react';
import { CATEGORY_IDS, CATEGORY_META, ROLLS_PER_TURN, RULE_PRESETS } from '../../core/rules';
import { grandTotal, isCategoryFilled } from '../../core/gameState';
import { scoreDice } from '../../core/scoring';
import {
  selectActivePlayer,
  selectMySeat,
  useMultiplayerStore,
} from '../../store/multiplayerStore';
import { Die } from '../Die';

export function MiniMultiplayer() {
  const room = useMultiplayerStore((s) => s.room);
  if (!room || room.status === 'lobby') return <MiniMpLobby />;
  if (room.status === 'finished') return <MiniMpOver />;
  return <MiniMpGame />;
}

// ── 로비: 닉네임 + 방 만들기/참가 ──
function MiniMpLobby() {
  const createRoom = useMultiplayerStore((s) => s.createRoom);
  const joinRoom = useMultiplayerStore((s) => s.joinRoom);
  const startGame = useMultiplayerStore((s) => s.startGame);
  const leave = useMultiplayerStore((s) => s.leave);
  const room = useMultiplayerStore((s) => s.room);
  const players = useMultiplayerStore((s) => s.players);
  const busy = useMultiplayerStore((s) => s.busy);
  const error = useMultiplayerStore((s) => s.error);
  const myUserId = useMultiplayerStore((s) => s.myUserId);
  const [name, setName] = useState(() => localStorage.getItem('yd_mp_name') ?? '');
  const [code, setCode] = useState('');

  const remember = () => localStorage.setItem('yd_mp_name', name.trim());
  const amHost = !!room && players.find((p) => p.userId === myUserId)?.isHost;

  // 방에 들어와 있고(대기) 시작 전이면 코드/명단/시작 표시.
  if (room) {
    return (
      <div className="mini-mp">
        <div className="mini-mp-code">방 코드 {room.code}</div>
        <div className="mini-mp-list">
          {players.map((p) => (
            <div key={p.id} className="mini-mp-pl">
              {p.displayName}
              {p.isHost && ' 👑'}
            </div>
          ))}
        </div>
        {amHost ? (
          <button className="mini-roll" disabled={players.length < 2} onClick={() => void startGame()}>
            게임 시작
          </button>
        ) : (
          <div className="mini-mp-wait">방장이 시작하길 기다리는 중…</div>
        )}
        <button className="mini-mp-leave" onClick={() => void leave()}>
          나가기
        </button>
        {error && <div className="mini-mp-err">{error}</div>}
      </div>
    );
  }

  return (
    <div className="mini-mp">
      <input
        className="mini-mp-in"
        placeholder="닉네임"
        value={name}
        maxLength={12}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        className="mini-roll"
        disabled={busy || !name.trim()}
        onClick={() => {
          remember();
          void createRoom(name.trim(), false, 4, 'default');
        }}
      >
        방 만들기
      </button>
      <div className="mini-mp-join">
        <input
          className="mini-mp-in"
          placeholder="방 코드"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button
          className="mini-roll"
          disabled={busy || !name.trim() || code.trim().length < 4}
          onClick={() => {
            remember();
            void joinRoom(code.trim(), name.trim());
          }}
        >
          참가
        </button>
      </div>
      {error && <div className="mini-mp-err">{error}</div>}
    </div>
  );
}

// ── 게임: 내 차례에만 굴림/보관/기록 ──
function MiniMpGame() {
  const room = useMultiplayerStore((s) => s.room)!;
  const players = useMultiplayerStore((s) => s.players);
  const mySeat = useMultiplayerStore(selectMySeat);
  const active = useMultiplayerStore(selectActivePlayer);
  const rollDice = useMultiplayerStore((s) => s.rollDice);
  const setHeld = useMultiplayerStore((s) => s.setHeld);
  const assignCategory = useMultiplayerStore((s) => s.assignCategory);
  const leave = useMultiplayerStore((s) => s.leave);
  const error = useMultiplayerStore((s) => s.error);

  const rules = RULE_PRESETS[room.rulePreset].config;
  const myTurn = mySeat !== null && room.currentSeat === mySeat;
  const me = players.find((p) => p.seat === mySeat);
  const dice = room.dice.length ? room.dice : [1, 2, 3, 4, 5];
  const held = room.held.length ? room.held : [false, false, false, false, false];
  const rolled = room.rollsUsed > 0;
  const canRoll = myTurn && room.rollsUsed < ROLLS_PER_TURN;
  const canReroll = myTurn && rolled && room.rollsUsed < ROLLS_PER_TURN;

  const toggleHold = (i: number) => {
    if (!canReroll) return;
    const next = held.slice();
    next[i] = !next[i];
    void setHeld(next);
  };

  return (
    <div className="mini-mp">
      <div className="mini-mp-turn">
        {myTurn ? '내 차례' : `${active?.displayName ?? '상대'} 차례`} · {room.rollsUsed}/{ROLLS_PER_TURN}
      </div>
      <div className="mini-dice">
        {dice.map((v, i) => (
          <Die
            key={i}
            value={v}
            active={rolled}
            held={held[i]}
            suggested={false}
            clickable={canReroll}
            animKey={`${i}-${v}-${room.rollsUsed}`}
            onClick={() => toggleHold(i)}
          />
        ))}
      </div>
      <button className="mini-roll" disabled={!canRoll} onClick={() => void rollDice()}>
        {room.rollsUsed === 0 ? '굴리기' : `리롤 (${ROLLS_PER_TURN - room.rollsUsed})`}
      </button>
      {me && (
        <div className="mini-card">
          {CATEGORY_IDS.map((id) => {
            const filled = isCategoryFilled(me.scorecard, id);
            const preview =
              myTurn && rolled && !filled ? scoreDice(id, dice, rules) : null;
            return (
              <button
                key={id}
                className={`mini-cat ${filled ? 'filled' : ''}`}
                disabled={!myTurn || filled || !rolled}
                onClick={() => void assignCategory(id)}
              >
                <span className="k">{CATEGORY_META[id].ko}</span>
                <span className="v">
                  {filled ? (me.scorecard.scores[id] ?? 0) : preview === null ? '·' : preview}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="mini-mp-scores">
        {players.map((p) => (
          <span key={p.id} className={p.seat === room.currentSeat ? 'cur' : ''}>
            {p.displayName} {grandTotal(p.scorecard, rules)}
          </span>
        ))}
      </div>
      <button className="mini-mp-leave" onClick={() => void leave()}>
        나가기
      </button>
      {error && <div className="mini-mp-err">{error}</div>}
    </div>
  );
}

// ── 종료: 승자 + 나가기 ──
function MiniMpOver() {
  const room = useMultiplayerStore((s) => s.room)!;
  const players = useMultiplayerStore((s) => s.players);
  const leave = useMultiplayerStore((s) => s.leave);
  const rules = RULE_PRESETS[room.rulePreset].config;
  const winner = players.find((p) => p.seat === room.winnerSeat);

  return (
    <div className="mini-mp">
      <div className="mini-mp-result">
        {room.isTie ? '무승부' : `🏆 ${winner?.displayName ?? '?'} 승리`}
      </div>
      <div className="mini-mp-scores">
        {players.map((p) => (
          <span key={p.id}>
            {p.displayName} {grandTotal(p.scorecard, rules)}
          </span>
        ))}
      </div>
      <button className="mini-mp-leave" onClick={() => void leave()}>
        나가기
      </button>
    </div>
  );
}
