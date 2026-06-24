-- ============================================================================
-- Yacht Dice 멀티플레이 백엔드 스키마 (Supabase / Postgres)
-- 새 프로젝트의 SQL Editor 에 통째로 붙여넣어 실행하세요.
-- 이후 Authentication → Sign In/Providers 에서 "Anonymous sign-ins" 를 켜야 합니다.
-- ----------------------------------------------------------------------------
-- 설계: 서버 권위. 주사위는 서버 RNG, 모든 변경은 SECURITY DEFINER RPC,
--       클라이언트 직접 쓰기는 revoke + RLS 로 차단. 점수 로직은 src/core 와 동일.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── 스키마 ───────────────────────────────────────────────────────────────
create type room_status as enum ('lobby','playing','finished','abandoned');

create table public.rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  status          room_status not null default 'lobby',
  helper_allowed  boolean not null default false,
  -- 룰 프리셋(기본/추가). 추가 룰은 요트의 달인·요트도 포커처럼 보너스를 서버에서 강제.
  rule_preset_id  text not null default 'default' check (rule_preset_id in ('default','additional')),
  max_players     int not null default 4 check (max_players between 2 and 4),
  host_id         uuid not null,
  current_seat    int,
  round           int not null default 0 check (round between 0 and 12),
  dice            smallint[] not null default '{}'::smallint[]
                    check (array_length(dice,1) is null or array_length(dice,1) = 5),
  held            boolean[] not null default '{}'::boolean[]
                    check (array_length(held,1) is null or array_length(held,1) = 5),
  rolls_used      smallint not null default 0 check (rolls_used between 0 and 3),
  turn_started_at timestamptz,
  winner_seat     int,
  is_tie          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint rooms_dice_range check (dice <@ array[1,2,3,4,5,6]::smallint[])
);
create index rooms_code_idx on public.rooms (code);
create index rooms_status_idx on public.rooms (status, created_at);

create table public.room_players (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  user_id       uuid not null,
  seat          int not null check (seat between 0 and 3),
  display_name  text not null check (char_length(display_name) between 1 and 24),
  is_host       boolean not null default false,
  connected     boolean not null default true,
  scorecard     jsonb not null default '{"scores":{}}'::jsonb,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, seat)
);
create index room_players_room_idx on public.room_players (room_id, seat);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public, extensions as $$
begin new.updated_at = now(); return new; end $$;

create trigger rooms_touch before update on public.rooms
  for each row execute function public.touch_updated_at();

-- ── 순수 로직 (src/core 포팅) ────────────────────────────────────────────
create or replace function public.has_run(cnt int[], p_start int, p_len int)
returns boolean language plpgsql immutable set search_path = public, extensions as $$
declare v int;
begin
  for v in p_start..(p_start + p_len - 1) loop
    if coalesce(cnt[v], 0) = 0 then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.score_category(p_category text, p_dice smallint[])
returns int language plpgsql immutable set search_path = public, extensions as $$
declare
  cnt int[] := array[0,0,0,0,0,0];
  d int; v int; s int := 0; mx int := 0;
  has2 boolean := false; has3 boolean := false;
begin
  if p_dice is null or array_length(p_dice,1) <> 5 then raise exception 'invalid dice'; end if;
  foreach d in array p_dice loop
    if d < 1 or d > 6 then raise exception 'invalid die %', d; end if;
    cnt[d] := cnt[d] + 1;
  end loop;
  for v in 1..6 loop
    s := s + v * cnt[v];
    if cnt[v] > mx then mx := cnt[v]; end if;
    if cnt[v] = 2 then has2 := true; end if;
    if cnt[v] = 3 then has3 := true; end if;
  end loop;
  if p_category not in ('ones','twos','threes','fours','fives','sixes','choice',
       'fourKind','fullHouse','smallStraight','largeStraight','yacht') then
    raise exception 'unknown category %', p_category;
  end if;
  return case p_category
    when 'ones'   then cnt[1] * 1
    when 'twos'   then cnt[2] * 2
    when 'threes' then cnt[3] * 3
    when 'fours'  then cnt[4] * 4
    when 'fives'  then cnt[5] * 5
    when 'sixes'  then cnt[6] * 6
    when 'choice' then s
    when 'fourKind'      then case when mx >= 4 then s else 0 end
    when 'fullHouse'     then case when (has2 and has3) then s else 0 end
    when 'smallStraight' then case when public.has_run(cnt,1,4) or public.has_run(cnt,2,4) or public.has_run(cnt,3,4) then 15 else 0 end
    when 'largeStraight' then case when public.has_run(cnt,1,5) or public.has_run(cnt,2,5) then 30 else 0 end
    when 'yacht'         then case when mx = 5 then 50 else 0 end
  end;
end $$;

-- 카드 총점. 추가 룰('additional')이면 보너스를 더한다(src/core/gameState.grandTotal 과 동일):
--  · 요트의 달인: masterCells(보너스 칸) 1개당 +100. 상단 소계·하단4종 판정엔 미포함(scores 밖).
--  · 요트도 포커처럼: 하단 4종(포카드·풀하우스·스몰·라지)이 모두 실제 조합(>0)이면 +50.
create or replace function public.scorecard_total(sc jsonb, p_rule_preset text default 'default')
returns int language plpgsql immutable set search_path = public, extensions as $$
declare
  upper_cats text[] := array['ones','twos','threes','fours','fives','sixes'];
  lower_cats text[] := array['choice','fourKind','fullHouse','smallStraight','largeStraight','yacht'];
  c text; upper_sum int := 0; lower_sum int := 0; total int;
  master_n int; lower_four_done boolean;
begin
  foreach c in array upper_cats loop upper_sum := upper_sum + coalesce((sc->'scores'->>c)::int, 0); end loop;
  foreach c in array lower_cats loop lower_sum := lower_sum + coalesce((sc->'scores'->>c)::int, 0); end loop;
  total := upper_sum + (case when upper_sum >= 63 then 35 else 0 end) + lower_sum;
  if p_rule_preset = 'additional' then
    master_n := coalesce(jsonb_array_length(sc->'masterCells'), 0);
    lower_four_done :=
         coalesce((sc->'scores'->>'fourKind')::int, 0)      > 0
     and coalesce((sc->'scores'->>'fullHouse')::int, 0)      > 0
     and coalesce((sc->'scores'->>'smallStraight')::int, 0)  > 0
     and coalesce((sc->'scores'->>'largeStraight')::int, 0)  > 0;
    total := total + master_n * 100 + (case when lower_four_done then 50 else 0 end);
  end if;
  return total;
end $$;

create or replace function public.roll_n_dice(n int)
returns smallint[] language plpgsql volatile set search_path = public, extensions as $$
declare out smallint[] := '{}'::smallint[]; b int; i int;
begin
  for i in 1..n loop
    loop b := get_byte(gen_random_bytes(1), 0); exit when b < 252; end loop;
    out := out || (((b % 6) + 1)::smallint);
  end loop;
  return out;
end $$;

create or replace function public.generate_unique_room_code()
returns text language plpgsql volatile set search_path = public, extensions as $$
declare alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; gen_code text; i int; attempts int := 0;
begin
  loop
    gen_code := '';
    for i in 1..6 loop
      gen_code := gen_code || substr(alphabet, (get_byte(gen_random_bytes(1),0) % length(alphabet)) + 1, 1);
    end loop;
    if not exists (select 1 from public.rooms where rooms.code = gen_code and status in ('lobby','playing')) then
      return gen_code;
    end if;
    attempts := attempts + 1;
    if attempts > 20 then raise exception 'could not allocate room code'; end if;
  end loop;
end $$;

create or replace function public._finish_game(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare maxtotal int; winners int; wseat int; preset text;
begin
  select rule_preset_id into preset from public.rooms where id = p_room;
  select max(public.scorecard_total(scorecard, preset)) into maxtotal
    from public.room_players where room_id = p_room;
  select count(*) into winners
    from public.room_players where room_id = p_room and public.scorecard_total(scorecard, preset) = maxtotal;
  if winners = 1 then
    select seat into wseat
      from public.room_players where room_id = p_room and public.scorecard_total(scorecard, preset) = maxtotal
      limit 1;
    update public.rooms set status='finished', winner_seat = wseat, is_tie = false,
      current_seat = null, dice='{}', held='{}', rolls_used = 0 where id = p_room;
  else
    update public.rooms set status='finished', winner_seat = null, is_tie = true,
      current_seat = null, dice='{}', held='{}', rolls_used = 0 where id = p_room;
  end if;
end $$;

-- 점수 기록 + 다음 차례(오름차순 seat 순회, 한 바퀴=round+1, round>=12 종료)
create or replace function public._apply_assignment(p_room uuid, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.rooms; pl public.room_players; val int; next_seat int; new_round int;
  yacht_master boolean;
begin
  select * into r from public.rooms where id = p_room;
  select * into pl from public.room_players where room_id = r.id and seat = r.current_seat;
  -- 보너스 칸(masterCells)과 일반 점수 칸 모두에서 빈 칸인지 확인.
  if (pl.scorecard->'scores' ? p_category)
     or ((pl.scorecard->'masterCells') ? p_category) then
    raise exception 'category already filled';
  end if;
  -- 요트의 달인: 추가 룰 + 요트(50) 이미 기록 + 최종 주사위가 5개 같은 눈이면,
  -- p_category 를 정상 채점하지 않고 보너스 칸으로 소비(+100 은 총점 계산에서 가산).
  yacht_master :=
        r.rule_preset_id = 'additional'
    and coalesce((pl.scorecard->'scores'->>'yacht')::int, -1) = 50
    and (select count(distinct d) from unnest(r.dice) d) = 1;
  if yacht_master then
    update public.room_players
      set scorecard = jsonb_set(
            scorecard, array['masterCells'],
            coalesce(scorecard->'masterCells', '[]'::jsonb) || to_jsonb(p_category), true),
          last_seen_at = now()
      where id = pl.id;
  else
    val := public.score_category(p_category, r.dice);
    update public.room_players
      set scorecard = jsonb_set(scorecard, array['scores', p_category], to_jsonb(val)),
          last_seen_at = now()
      where id = pl.id;
  end if;
  select seat into next_seat from public.room_players
    where room_id = r.id and seat > r.current_seat order by seat limit 1;
  if next_seat is null then
    select min(seat) into next_seat from public.room_players where room_id = r.id;
    new_round := r.round + 1;
  else
    new_round := r.round;
  end if;
  if new_round >= 12 then
    perform public._finish_game(r.id);
  else
    update public.rooms set current_seat = next_seat, round = new_round,
      dice='{}', held='{}', rolls_used = 0, turn_started_at = now() where id = r.id;
  end if;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────
create or replace function public.is_room_member(p_room uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.room_players where room_id = p_room and user_id = auth.uid()
  );
$$;

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

create policy rooms_select_member on public.rooms
  for select to authenticated using (public.is_room_member(id));
create policy room_players_select_member on public.room_players
  for select to authenticated using (public.is_room_member(room_id));

revoke insert, update, delete on public.rooms        from anon, authenticated;
revoke insert, update, delete on public.room_players from anon, authenticated;
grant  select on public.rooms, public.room_players to authenticated;

-- ── RPC (write 표면 전부) ────────────────────────────────────────────────
create or replace function public.create_room(
  p_display_name text, p_helper_allowed boolean default false, p_max_players int default 4,
  p_rule_preset text default 'default')
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id uuid; new_code text; preset text; helper boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_max_players < 2 or p_max_players > 4 then raise exception 'max_players must be 2..4'; end if;
  if char_length(coalesce(p_display_name,'')) = 0 then raise exception 'display name required'; end if;
  preset := coalesce(p_rule_preset, 'default');
  if preset not in ('default','additional') then raise exception 'invalid rule preset'; end if;
  -- 추가 룰은 헬퍼(최적 EV)를 지원하지 않으므로 강제로 끈다.
  helper := case when preset = 'additional' then false else coalesce(p_helper_allowed, false) end;
  new_code := public.generate_unique_room_code();
  insert into public.rooms(code, status, helper_allowed, rule_preset_id, max_players, host_id)
    values (new_code, 'lobby', helper, preset, p_max_players, uid)
    returning id into new_id;
  insert into public.room_players(room_id, user_id, seat, display_name, is_host)
    values (new_id, uid, 0, left(p_display_name,24), true);
  return jsonb_build_object('room_id', new_id, 'code', new_code, 'seat', 0, 'rule_preset', preset);
end $$;

create or replace function public.join_room(p_code text, p_display_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.rooms; existing public.room_players; new_seat int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if char_length(coalesce(p_display_name,'')) = 0 then raise exception 'display name required'; end if;
  select * into r from public.rooms where code = upper(p_code) for update;
  if not found then raise exception 'room not found'; end if;
  select * into existing from public.room_players where room_id = r.id and user_id = uid;
  if found then
    update public.room_players set display_name = left(p_display_name,24),
      last_seen_at = now(), connected = true where id = existing.id;
    return jsonb_build_object('room_id', r.id, 'code', r.code, 'seat', existing.seat);
  end if;
  if r.status <> 'lobby' then raise exception 'game already started'; end if;
  select min(s) into new_seat from generate_series(0, r.max_players - 1) s
    where s not in (select seat from public.room_players where room_id = r.id);
  if new_seat is null then raise exception 'room is full'; end if;
  insert into public.room_players(room_id, user_id, seat, display_name, is_host)
    values (r.id, uid, new_seat, left(p_display_name,24), false);
  return jsonb_build_object('room_id', r.id, 'code', r.code, 'seat', new_seat);
end $$;

create or replace function public.start_game(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.rooms; ncount int; first_seat int;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found then raise exception 'room not found'; end if;
  if r.host_id <> uid then raise exception 'only host can start'; end if;
  if r.status <> 'lobby' then raise exception 'not in lobby'; end if;
  select count(*) into ncount from public.room_players where room_id = r.id;
  if ncount < 2 then raise exception 'need at least 2 players'; end if;
  select min(seat) into first_seat from public.room_players where room_id = r.id;
  update public.rooms set status='playing', current_seat = first_seat, round = 0,
    dice='{}', held='{}', rolls_used = 0, turn_started_at = now() where id = r.id;
end $$;

create or replace function public.roll_dice(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.rooms; my_seat int; fresh smallint[]; nd smallint[] := '{}'::smallint[]; i int;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found then raise exception 'room not found'; end if;
  if r.status <> 'playing' then raise exception 'not playing'; end if;
  select seat into my_seat from public.room_players where room_id = r.id and user_id = uid;
  if my_seat is null or my_seat <> r.current_seat then raise exception 'not your turn'; end if;
  if r.rolls_used >= 3 then raise exception 'no rolls left'; end if;
  if r.rolls_used = 0 then
    nd := public.roll_n_dice(5);
    update public.rooms set dice = nd, held = array[false,false,false,false,false], rolls_used = 1 where id = r.id;
  else
    fresh := public.roll_n_dice(5);
    for i in 1..5 loop
      if r.held[i] then nd := nd || r.dice[i]; else nd := nd || fresh[i]; end if;
    end loop;
    update public.rooms set dice = nd, rolls_used = r.rolls_used + 1 where id = r.id;
  end if;
  update public.room_players set last_seen_at = now() where room_id = r.id and user_id = uid;
end $$;

create or replace function public.set_held(p_room uuid, p_held boolean[])
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.rooms; my_seat int;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found then raise exception 'room not found'; end if;
  if r.status <> 'playing' then raise exception 'not playing'; end if;
  select seat into my_seat from public.room_players where room_id = r.id and user_id = uid;
  if my_seat is null or my_seat <> r.current_seat then raise exception 'not your turn'; end if;
  if r.rolls_used = 0 then raise exception 'roll first'; end if;
  if r.rolls_used >= 3 then raise exception 'no rerolls left'; end if;
  if array_length(p_held,1) is distinct from 5 then raise exception 'held must be length 5'; end if;
  update public.rooms set held = p_held where id = r.id;
end $$;

create or replace function public.assign_category(p_room uuid, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.rooms; my_seat int;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found then raise exception 'room not found'; end if;
  if r.status <> 'playing' then raise exception 'not playing'; end if;
  select seat into my_seat from public.room_players where room_id = r.id and user_id = uid;
  if my_seat is null or my_seat <> r.current_seat then raise exception 'not your turn'; end if;
  if r.rolls_used = 0 then raise exception 'must roll before scoring'; end if;
  if p_category not in ('ones','twos','threes','fours','fives','sixes','choice',
       'fourKind','fullHouse','smallStraight','largeStraight','yacht') then
    raise exception 'invalid category';
  end if;
  perform public._apply_assignment(p_room, p_category);
end $$;

create or replace function public.leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.rooms; me public.room_players; remaining int; new_host public.room_players;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found then return; end if;
  select * into me from public.room_players where room_id = r.id and user_id = uid;
  if not found then return; end if;
  if r.status = 'lobby' then
    delete from public.room_players where id = me.id;
    select count(*) into remaining from public.room_players where room_id = r.id;
    if remaining = 0 then
      update public.rooms set status='abandoned' where id = r.id;
    elsif me.is_host then
      select * into new_host from public.room_players where room_id = r.id order by seat limit 1;
      update public.room_players set is_host = true where id = new_host.id;
      update public.rooms set host_id = new_host.user_id where id = r.id;
    end if;
  else
    update public.room_players set connected = false, last_seen_at = now() where id = me.id;
  end if;
end $$;

create or replace function public.skip_if_timed_out(p_room uuid, p_timeout_seconds int default 90)
returns void language plpgsql security definer set search_path = public as $$
declare r public.rooms; pl public.room_players; nd smallint[];
  cats text[] := array['ones','twos','threes','fours','fives','sixes','choice',
    'fourKind','fullHouse','smallStraight','largeStraight','yacht'];
  cat text; sc int; chosen text; chosen_score int;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found then raise exception 'room not found'; end if;
  if r.status <> 'playing' then return; end if;
  if not exists (select 1 from public.room_players where room_id = r.id and user_id = auth.uid()) then
    raise exception 'not a member';
  end if;
  if r.turn_started_at is null or r.turn_started_at > now() - make_interval(secs => p_timeout_seconds) then
    return;
  end if;
  if r.rolls_used = 0 then
    nd := public.roll_n_dice(5);
    update public.rooms set dice = nd, held = array[false,false,false,false,false], rolls_used = 1 where id = r.id;
    select * into r from public.rooms where id = r.id;
  end if;
  select * into pl from public.room_players where room_id = r.id and seat = r.current_seat;
  foreach cat in array cats loop
    if not (pl.scorecard->'scores' ? cat) and not ((pl.scorecard->'masterCells') ? cat) then
      sc := public.score_category(cat, r.dice);
      if chosen is null or sc < chosen_score then chosen := cat; chosen_score := sc; end if;
    end if;
  end loop;
  if chosen is null then return; end if;
  perform public._apply_assignment(p_room, chosen);
end $$;

create or replace function public.cleanup_rooms()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.rooms where
       (status = 'lobby'     and updated_at < now() - interval '2 hours')
    or (status = 'finished'  and updated_at < now() - interval '24 hours')
    or (status = 'abandoned' and updated_at < now() - interval '1 hour')
    or (status = 'playing'   and updated_at < now() - interval '6 hours');
end $$;

-- ── 리더보드(규칙별 Top10 랭킹) ──────────────────────────────────────────
-- 규칙 프리셋(기본/추가)별로 분리된 보드. mode(solo/multi/desktop)는 배지로만 표시.
-- 읽기는 공개(select), 쓰기는 submit_score RPC 만. 솔로·데스크톱은 서버 검증 불가(캐주얼).
-- score CHECK: 추가 룰은 요트의 달인 보너스로 기본 룰보다 크게 높아질 수 있어 상한 2000.
create table public.leaderboard (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,                                -- 익명(미로그인) 호출 시 null 허용
  nickname        text not null check (char_length(nickname) between 1 and 24),
  score           int  not null check (score between 0 and 2000),
  mode            text not null check (mode in ('solo','multi','desktop')),
  rule_preset_id  text not null default 'default' check (rule_preset_id in ('default','additional')),
  created_at      timestamptz not null default now()
);
-- 규칙별 상위 N 조회/정리를 위해 rule_preset_id 로 파티션.
create index leaderboard_rank_idx on public.leaderboard (rule_preset_id, score desc, created_at asc);

alter table public.leaderboard enable row level security;
create policy leaderboard_select_public on public.leaderboard
  for select to anon, authenticated using (true);
revoke insert, update, delete on public.leaderboard from anon, authenticated;
grant  select on public.leaderboard to anon, authenticated;

-- 점수 제출 + 규칙별 Top10 초과분 정리. anon/authenticated 모두 호출 가능.
create or replace function public.submit_score(
  p_nickname text, p_score int, p_mode text, p_rule_preset text default 'default')
returns void language plpgsql security definer set search_path = public as $$
declare preset text;
begin
  if char_length(coalesce(p_nickname,'')) = 0 then raise exception 'nickname required'; end if;
  if p_score < 0 or p_score > 2000 then raise exception 'score out of range'; end if;
  if p_mode not in ('solo','multi','desktop') then raise exception 'invalid mode'; end if;
  preset := coalesce(p_rule_preset, 'default');
  if preset not in ('default','additional') then raise exception 'invalid rule preset'; end if;
  insert into public.leaderboard(user_id, nickname, score, mode, rule_preset_id)
    values (auth.uid(), left(p_nickname,24), p_score, p_mode, preset);
  -- 규칙(rule_preset_id)별로 점수 desc·동점 먼저 등록 순(created_at asc) Top10 만 남기고 삭제.
  delete from public.leaderboard where id in (
    select id from (
      select id, row_number() over (
        partition by rule_preset_id order by score desc, created_at asc
      ) as rn from public.leaderboard
    ) t where t.rn > 10
  );
end $$;

-- ── 실행 권한: 전부 회수 후 사용자용 RPC만 authenticated 부여 ─────────────
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

grant execute on function
  public.create_room(text, boolean, int, text),
  public.join_room(text, text),
  public.start_game(uuid),
  public.roll_dice(uuid),
  public.set_held(uuid, boolean[]),
  public.assign_category(uuid, text),
  public.leave_room(uuid),
  public.skip_if_timed_out(uuid, int)
to authenticated;

-- RLS select 정책(rooms/room_players)이 호출하므로 authenticated 가 실행할 수 있어야 함.
-- (realtime postgres_changes 인가에도 필요)
grant execute on function public.is_room_member(uuid) to authenticated;

-- 리더보드 제출: 익명(미로그인) 사용자도 호출 가능(웹/데스크톱 공용).
grant execute on function public.submit_score(text, int, text, text) to anon, authenticated;

-- ── Realtime (Postgres Changes) ──────────────────────────────────────────
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
alter table public.rooms replica identity full;
alter table public.room_players replica identity full;
