-- ============================================================================
-- 마이그레이션: 리더보드 규칙 분리 (#20 PR3)
-- 운영 DB(wrdeqbqwxnmjsbwwnatx)에 증분 적용. schema.sql(전체 소스)과 동일 결과.
--   - leaderboard.rule_preset_id 컬럼(default/additional)
--   - score 상한 1000 → 2000(추가 룰 요트의 달인 보너스 대비)
--   - rank 인덱스: rule_preset_id 파티션
--   - submit_score: p_rule_preset 추가 + 규칙별 Top10 정리(윈도우 함수)
-- 하위호환: 기존 기록 rule_preset_id='default', submit_score 4번째 인자 default 라
--           구버전 클라이언트(3-arg 호출)도 그대로 동작.
-- ============================================================================
begin;

-- 1) 규칙 프리셋 컬럼(멱등)
alter table public.leaderboard
  add column if not exists rule_preset_id text not null default 'default';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'leaderboard_rule_preset_chk') then
    alter table public.leaderboard
      add constraint leaderboard_rule_preset_chk check (rule_preset_id in ('default','additional'));
  end if;
end $$;

-- 2) score 상한 1000 → 2000(기존 익명 check 제약을 찾아 교체)
do $$
declare cn text;
begin
  select conname into cn from pg_constraint
   where conrelid = 'public.leaderboard'::regclass and contype = 'c'
     and conname <> 'leaderboard_rule_preset_chk'
     and pg_get_constraintdef(oid) ilike '%score%';
  if cn is not null then
    execute format('alter table public.leaderboard drop constraint %I', cn);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'leaderboard_score_chk') then
    alter table public.leaderboard
      add constraint leaderboard_score_chk check (score between 0 and 2000);
  end if;
end $$;

-- 3) 규칙별 랭킹 인덱스
drop index if exists public.leaderboard_rank_idx;
create index leaderboard_rank_idx on public.leaderboard (rule_preset_id, score desc, created_at asc);

-- 4) submit_score: 규칙 인자 + 규칙별 Top10 정리(구 3-arg 제거 후 재생성 + grant)
drop function if exists public.submit_score(text, int, text);
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
  delete from public.leaderboard where id in (
    select id from (
      select id, row_number() over (
        partition by rule_preset_id order by score desc, created_at asc
      ) as rn from public.leaderboard
    ) t where t.rn > 10
  );
end $$;

grant execute on function public.submit_score(text, int, text, text) to anon, authenticated;

commit;
