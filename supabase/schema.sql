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

create or replace function public.scorecard_total(sc jsonb)
returns int language plpgsql immutable set search_path = public, extensions as $$
declare
  upper_cats text[] := array['ones','twos','threes','fours','fives','sixes'];
  lower_cats text[] := array['choice','fourKind','fullHouse','smallStraight','largeStraight','yacht'];
  c text; upper_sum int := 0; lower_sum int := 0;
begin
  foreach c in array upper_cats loop upper_sum := upper_sum + coalesce((sc->'scores'->>c)::int, 0); end loop;
  foreach c in array lower_cats loop lower_sum := lower_sum + coalesce((sc->'scores'->>c)::int, 0); end loop;
  return upper_sum + (case when upper_sum >= 63 then 35 else 0 end) + lower_sum;
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
declare maxtotal int; winners int; wseat int;
begin
  select max(public.scorecard_total(scorecard)) into maxtotal
    from public.room_players where room_id = p_room;
  select count(*) into winners
    from public.room_players where room_id = p_room and public.scorecard_total(scorecard) = maxtotal;
  if winners = 1 then
    select seat into wseat
      from public.room_players where room_id = p_room and public.scorecard_total(scorecard) = maxtotal
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
begin
  select * into r from public.rooms where id = p_room;
  select * into pl from public.room_players where room_id = r.id and seat = r.current_seat;
  if pl.scorecard->'scores' ? p_category then raise exception 'category already filled'; end if;
  val := public.score_category(p_category, r.dice);
  update public.room_players
    set scorecard = jsonb_set(scorecard, array['scores', p_category], to_jsonb(val)),
        last_seen_at = now()
    where id = pl.id;
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
  p_display_name text, p_helper_allowed boolean default false, p_max_players int default 4)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id uuid; new_code text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_max_players < 2 or p_max_players > 4 then raise exception 'max_players must be 2..4'; end if;
  if char_length(coalesce(p_display_name,'')) = 0 then raise exception 'display name required'; end if;
  new_code := public.generate_unique_room_code();
  insert into public.rooms(code, status, helper_allowed, max_players, host_id)
    values (new_code, 'lobby', coalesce(p_helper_allowed,false), p_max_players, uid)
    returning id into new_id;
  insert into public.room_players(room_id, user_id, seat, display_name, is_host)
    values (new_id, uid, 0, left(p_display_name,24), true);
  return jsonb_build_object('room_id', new_id, 'code', new_code, 'seat', 0);
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
    if not (pl.scorecard->'scores' ? cat) then
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

-- ── 리더보드(Top10 글로벌 랭킹) ──────────────────────────────────────────
-- 솔로/멀티/데스크톱 공용 단일 보드. 읽기는 공개(select), 쓰기는 submit_score RPC 만.
-- 룸과 달리 솔로·데스크톱 점수는 서버 검증이 불가 → 클라이언트 신뢰 기반(캐주얼).
-- score CHECK 로 비현실적 값만 차단(기본 룰 실제 최대 ≈ 323).
create table public.leaderboard (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,                                    -- 익명(미로그인) 호출 시 null 허용
  nickname    text not null check (char_length(nickname) between 1 and 24),
  score       int  not null check (score between 0 and 1000),
  mode        text not null check (mode in ('solo','multi','desktop')),
  created_at  timestamptz not null default now()
);
create index leaderboard_rank_idx on public.leaderboard (score desc, created_at asc);

alter table public.leaderboard enable row level security;
create policy leaderboard_select_public on public.leaderboard
  for select to anon, authenticated using (true);
revoke insert, update, delete on public.leaderboard from anon, authenticated;
grant  select on public.leaderboard to anon, authenticated;

-- 점수 제출 + Top10 초과분 정리(= 10개만 저장). anon/authenticated 모두 호출 가능.
create or replace function public.submit_score(p_nickname text, p_score int, p_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_nickname,'')) = 0 then raise exception 'nickname required'; end if;
  if p_score < 0 or p_score > 1000 then raise exception 'score out of range'; end if;
  if p_mode not in ('solo','multi','desktop') then raise exception 'invalid mode'; end if;
  insert into public.leaderboard(user_id, nickname, score, mode)
    values (auth.uid(), left(p_nickname,24), p_score, p_mode);
  -- 점수 desc, 동점은 먼저 등록한 순(created_at asc)으로 Top10 만 남기고 삭제.
  delete from public.leaderboard where id not in (
    select id from public.leaderboard order by score desc, created_at asc limit 10
  );
end $$;

-- ── 사용자 피드백(버그/건의/기타) ────────────────────────────────────────
-- 인앱 폼 → submit_feedback RPC 만 쓰기 가능. 읽기는 완전 비공개(SELECT 정책 없음)
-- → 운영자는 Supabase Table Editor(서비스 롤)에서만 확인. 클라는 절대 못 읽음.
-- 스팸 방지(계층): ① 허니팟(봇 조용히 무시) ② 종류/길이 CHECK·검증 ③ 세션당 레이트리밋(best-effort)
--   ④ 전역 분당 백스톱(폭주 시 증가율 상한). 익명 세션은 무료 재발급되므로 ③ 단독은 결정적 방어가 아니다 —
--   실질 봇 방어는 Supabase 대시보드의 '익명 가입' IP 레이트리밋 + (후속 단계) Cloudflare Turnstile 에 의존.
create table public.feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,                                          -- 익명 세션 id(레이트리밋 키)
  kind         text not null check (kind in ('bug','feature','other')),
  message      text not null check (char_length(message) between 1 and 2000),
  contact      text check (contact is null or char_length(contact) <= 200),
  app_version  text check (app_version is null or char_length(app_version) <= 40),
  screen       text check (screen is null or char_length(screen) <= 40),
  helper_used  boolean,
  user_agent   text check (user_agent is null or char_length(user_agent) <= 500),
  status       text not null default 'new' check (status in ('new','triaged','done','spam')),
  created_at   timestamptz not null default now()
);
create index feedback_triage_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;
-- SELECT 정책을 두지 않으므로 API 로는 아무도 못 읽는다(완전 비공개). 완전 비공개 테이블이라
-- DML 뿐 아니라 잔여 권한(REFERENCES/TRIGGER/TRUNCATE 등)까지 전부 회수(revoke all)한다.
revoke all on public.feedback from anon, authenticated;

-- 피드백 제출(유일한 쓰기 표면). 익명 세션(auth.uid()) 필수 → 레이트리밋 키로 사용.
create or replace function public.submit_feedback(
  p_kind text, p_message text, p_contact text default null,
  p_meta jsonb default '{}'::jsonb, p_hp text default '')
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  -- 허니팟: 숨김 필드가 채워졌으면 봇 → 성공인 척 조용히 무시(에러 안 냄 = 함정 노출 방지).
  if coalesce(p_hp, '') <> '' then return; end if;
  if uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('bug','feature','other') then raise exception 'invalid kind'; end if;
  if char_length(coalesce(p_message,'')) < 1 or char_length(p_message) > 2000 then
    raise exception 'message length must be 1..2000';
  end if;
  if p_contact is not null and char_length(p_contact) > 200 then
    raise exception 'contact too long';
  end if;
  -- 메타 jsonb 자체는 저장하지 않지만(추출 컬럼만 저장) 거대한 입력은 미리 차단.
  if p_meta is not null and length(p_meta::text) > 4000 then raise exception 'meta too large'; end if;
  -- 세션당 레이트리밋(best-effort): 10분 5건. definer 라 RLS 우회하고 자기 행을 셀 수 있음.
  -- 익명 세션은 무료 재발급되므로 결정적 방어가 아니라 '정직한 사용자의 중복 제출'만 막는 용도.
  if (select count(*) from public.feedback
        where user_id = uid and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'too many submissions';
  end if;
  -- 전역 분당 백스톱: uid 를 돌려가며 폭주해도 테이블 증가율의 상한을 둔다(정상 트래픽은 도달 불가).
  if (select count(*) from public.feedback
        where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many submissions';
  end if;
  insert into public.feedback(user_id, kind, message, contact, app_version, screen, helper_used, user_agent)
  values (
    uid,
    p_kind,
    left(p_message, 2000),
    nullif(btrim(coalesce(p_contact, '')), ''),
    nullif(left(coalesce(p_meta->>'app_version', ''), 40), ''),
    nullif(left(coalesce(p_meta->>'screen', ''), 40), ''),
    case when jsonb_typeof(p_meta->'helper_used') = 'boolean' then (p_meta->>'helper_used')::boolean else null end,
    nullif(left(coalesce(p_meta->>'user_agent', ''), 500), '')
  );
end $$;

-- 피드백 정리(운영자/서비스 롤 전용 — anon/authenticated 에 grant 하지 않음 → 쓰기 표면 안 늘어남).
-- cleanup_rooms 와 동일하게 스케줄러(pg_cron 등)나 서비스 롤이 호출. 스팸/처리완료/오래된 미처리분 삭제.
create or replace function public.cleanup_feedback()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.feedback where
       status = 'spam'
    or (status in ('done','triaged') and created_at < now() - interval '90 days');
end $$;

-- ── 실행 권한: 전부 회수 후 사용자용 RPC만 authenticated 부여 ─────────────
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

grant execute on function
  public.create_room(text, boolean, int),
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
grant execute on function public.submit_score(text, int, text) to anon, authenticated;

-- 피드백 제출: 함수가 auth.uid() 를 요구하므로, 세션 없는 anon 롤 호출은 'not authenticated' 로 거부된다.
grant execute on function public.submit_feedback(text, text, text, jsonb, text) to anon, authenticated;

-- ── Realtime (Postgres Changes) ──────────────────────────────────────────
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
alter table public.rooms replica identity full;
alter table public.room_players replica identity full;
