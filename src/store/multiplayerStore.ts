// 서버 권위 멀티플레이 상태(읽기 전용 모델 + RPC 래퍼 + Realtime 구독).
// 모든 변경은 Supabase RPC 경유. Postgres Changes 로 방 멤버에게 동기화.

import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, ensureAnonSession } from '../lib/supabase';
import type { CategoryId } from '../core/rules';
import type { Scorecard } from '../core/gameState';

export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'abandoned';

export interface MpRoom {
  id: string;
  code: string;
  status: RoomStatus;
  helperAllowed: boolean;
  maxPlayers: number;
  hostId: string;
  currentSeat: number | null;
  round: number;
  dice: number[];
  held: boolean[];
  rollsUsed: number;
  winnerSeat: number | null;
  isTie: boolean;
}

export interface MpPlayer {
  id: string;
  userId: string;
  seat: number;
  displayName: string;
  isHost: boolean;
  connected: boolean;
  scorecard: Scorecard;
}

interface MpState {
  room: MpRoom | null;
  players: MpPlayer[];
  myUserId: string | null;
  /** 점수표로 보고 있는 좌석(로컬 UI 전용). null = 현재 차례 따라가기. */
  selectedSeat: number | null;
  busy: boolean;
  error: string | null;
  channel: RealtimeChannel | null;

  selectPlayer: (seat: number | null) => void;
  createRoom: (name: string, helperAllowed: boolean, maxPlayers: number) => Promise<boolean>;
  joinRoom: (code: string, name: string) => Promise<boolean>;
  startGame: () => Promise<void>;
  rollDice: () => Promise<void>;
  setHeld: (held: boolean[]) => Promise<void>;
  assignCategory: (cat: CategoryId) => Promise<void>;
  leave: () => Promise<void>;
  clearError: () => void;
  subscribeRoom: (roomId: string) => void;
  refetch: (roomId: string) => Promise<void>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRoom(r: any): MpRoom {
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    helperAllowed: !!r.helper_allowed,
    maxPlayers: r.max_players,
    hostId: r.host_id,
    currentSeat: r.current_seat,
    round: r.round,
    dice: (r.dice ?? []) as number[],
    held: (r.held ?? []) as boolean[],
    rollsUsed: r.rolls_used,
    winnerSeat: r.winner_seat,
    isTie: !!r.is_tie,
  };
}

function mapPlayer(p: any): MpPlayer {
  return {
    id: p.id,
    userId: p.user_id,
    seat: p.seat,
    displayName: p.display_name,
    isHost: !!p.is_host,
    connected: !!p.connected,
    scorecard: (p.scorecard ?? { scores: {} }) as Scorecard,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ERROR_KO: [string, string][] = [
  ['Anonymous sign-ins are disabled', '익명 로그인이 비활성화되어 있습니다. Supabase 대시보드에서 켜주세요.'],
  ['room not found', '방을 찾을 수 없습니다. 코드를 확인하세요.'],
  ['game already started', '이미 시작된 게임입니다.'],
  ['room is full', '방이 가득 찼습니다.'],
  ['need at least 2 players', '2명 이상이어야 시작할 수 있습니다.'],
  ['only host can start', '방장만 시작할 수 있습니다.'],
  ['not your turn', '당신의 차례가 아닙니다.'],
  ['display name required', '닉네임을 입력하세요.'],
  ['category already filled', '이미 기록된 칸입니다.'],
];

function humanError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  for (const [needle, ko] of ERROR_KO) if (msg.includes(needle)) return ko;
  return msg;
}

export const useMultiplayerStore = create<MpState>((set, get) => ({
  room: null,
  players: [],
  myUserId: null,
  selectedSeat: null,
  busy: false,
  error: null,
  channel: null,

  selectPlayer: (seat) => set({ selectedSeat: seat }),

  createRoom: async (name, helperAllowed, maxPlayers) => {
    set({ busy: true, error: null });
    try {
      const uid = await ensureAnonSession();
      set({ myUserId: uid });
      const { data, error } = await supabase.rpc('create_room', {
        p_display_name: name,
        p_helper_allowed: helperAllowed,
        p_max_players: maxPlayers,
      });
      if (error) throw error;
      const roomId = (data as { room_id: string }).room_id;
      const code = (data as { code: string }).code;
      localStorage.setItem('yd_mp_code', code);
      get().subscribeRoom(roomId);
      await get().refetch(roomId);
      set({ busy: false });
      return true;
    } catch (e) {
      set({ busy: false, error: humanError(e) });
      return false;
    }
  },

  joinRoom: async (code, name) => {
    set({ busy: true, error: null });
    try {
      const uid = await ensureAnonSession();
      set({ myUserId: uid });
      const { data, error } = await supabase.rpc('join_room', {
        p_code: code.trim().toUpperCase(),
        p_display_name: name,
      });
      if (error) throw error;
      const roomId = (data as { room_id: string }).room_id;
      localStorage.setItem('yd_mp_code', (data as { code: string }).code);
      get().subscribeRoom(roomId);
      await get().refetch(roomId);
      set({ busy: false });
      return true;
    } catch (e) {
      set({ busy: false, error: humanError(e) });
      return false;
    }
  },

  startGame: async () => {
    const room = get().room;
    if (!room) return;
    const { error } = await supabase.rpc('start_game', { p_room: room.id });
    if (error) set({ error: humanError(error) });
  },

  rollDice: async () => {
    const room = get().room;
    if (!room) return;
    const { error } = await supabase.rpc('roll_dice', { p_room: room.id });
    if (error) set({ error: humanError(error) });
  },

  setHeld: async (held) => {
    const room = get().room;
    if (!room) return;
    // 낙관적 업데이트(서버 스냅샷이 곧 덮어씀).
    set({ room: { ...room, held } });
    const { error } = await supabase.rpc('set_held', { p_room: room.id, p_held: held });
    if (error) set({ error: humanError(error) });
  },

  assignCategory: async (cat) => {
    const room = get().room;
    if (!room) return;
    const { error } = await supabase.rpc('assign_category', { p_room: room.id, p_category: cat });
    if (error) set({ error: humanError(error) });
  },

  leave: async () => {
    const { room, channel } = get();
    if (room) await supabase.rpc('leave_room', { p_room: room.id }).then(undefined, () => {});
    if (channel) void supabase.removeChannel(channel);
    localStorage.removeItem('yd_mp_code');
    set({ room: null, players: [], channel: null, error: null, selectedSeat: null });
  },

  clearError: () => set({ error: null }),

  subscribeRoom: (roomId) => {
    const prev = get().channel;
    if (prev) void supabase.removeChannel(prev);
    const ch = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            set({ room: null, players: [] });
            return;
          }
          set({ room: mapRoom(payload.new) });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const players = get().players.slice();
          if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id?: string }).id;
            set({ players: players.filter((p) => p.id !== oldId) });
            return;
          }
          const np = mapPlayer(payload.new);
          const idx = players.findIndex((p) => p.id === np.id);
          if (idx >= 0) players[idx] = np;
          else players.push(np);
          players.sort((a, b) => a.seat - b.seat);
          set({ players });
        },
      )
      .subscribe();
    set({ channel: ch });
  },

  refetch: async (roomId) => {
    const { data: roomData } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
    const { data: playersData } = await supabase
      .from('room_players')
      .select('*')
      .eq('room_id', roomId)
      .order('seat');
    if (roomData) set({ room: mapRoom(roomData) });
    if (playersData) set({ players: (playersData as unknown[]).map(mapPlayer) });
  },
}));

/** 파생: 내 좌석 / 활성 플레이어 / 내 차례 여부. */
export function selectMySeat(s: MpState): number | null {
  const me = s.players.find((p) => p.userId === s.myUserId);
  return me ? me.seat : null;
}
export function selectActivePlayer(s: MpState): MpPlayer | null {
  if (!s.room || s.room.currentSeat === null) return null;
  return s.players.find((p) => p.seat === s.room!.currentSeat) ?? null;
}
