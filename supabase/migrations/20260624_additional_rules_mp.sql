-- ============================================================================
-- 마이그레이션: 멀티플레이 추가 룰 지원 (#20 PR2)
-- 운영 DB(wrdeqbqwxnmjsbwwnatx)에 증분 적용. schema.sql(전체 소스)과 동일 결과.
--   - rooms.rule_preset_id 컬럼
--   - scorecard_total(jsonb, text): 요트의 달인 +100×n · 요트도 포커처럼 +50
--   - _apply_assignment: 요트의 달인(빈 칸 1개 보너스 소비) 분기
--   - _finish_game: 방 프리셋으로 승자 판정
--   - skip_if_timed_out: 빈 칸 판정에 masterCells 제외
--   - create_room: p_rule_preset(추가 룰이면 헬퍼 강제 off)
-- 하위호환: 기존 방은 rule_preset_id='default', create_room 4번째 인자는 default 라
--           구버전 웹 클라이언트(3-arg 호출)도 그대로 동작.
-- ============================================================================
begin;

-- 1) rooms 컬럼 + 체크 제약(멱등)
alter table public.rooms add column if not exists rule_preset_id text not null default 'default';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_rule_preset_chk') then
    alter table public.rooms
      add constraint rooms_rule_preset_chk check (rule_preset_id in ('default','additional'));
  end if;
end $$;

-- 2) 카드 총점(프리셋 인자 + 추가 룰 보너스)
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

-- 3) 승자 판정(방 프리셋 전달)
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

-- 4) 점수 기록 + 요트의 달인 분기
create or replace function public._apply_assignment(p_room uuid, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.rooms; pl public.room_players; val int; next_seat int; new_round int;
  yacht_master boolean;
begin
  select * into r from public.rooms where id = p_room;
  select * into pl from public.room_players where room_id = r.id and seat = r.current_seat;
  if (pl.scorecard->'scores' ? p_category)
     or ((pl.scorecard->'masterCells') ? p_category) then
    raise exception 'category already filled';
  end if;
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

-- 5) 타임아웃 자동 스킵: 빈 칸 판정에 masterCells 제외
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

-- 6) 구 단일 인자 scorecard_total 제거(이제 _finish_game 은 2-arg 사용)
drop function if exists public.scorecard_total(jsonb);

-- 7) create_room: p_rule_preset 추가(구 3-arg 오버로드 제거 후 재생성 + grant)
drop function if exists public.create_room(text, boolean, int);
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
  helper := case when preset = 'additional' then false else coalesce(p_helper_allowed, false) end;
  new_code := public.generate_unique_room_code();
  insert into public.rooms(code, status, helper_allowed, rule_preset_id, max_players, host_id)
    values (new_code, 'lobby', helper, preset, p_max_players, uid)
    returning id into new_id;
  insert into public.room_players(room_id, user_id, seat, display_name, is_host)
    values (new_id, uid, 0, left(p_display_name,24), true);
  return jsonb_build_object('room_id', new_id, 'code', new_code, 'seat', 0, 'rule_preset', preset);
end $$;

grant execute on function public.create_room(text, boolean, int, text) to authenticated;

commit;
