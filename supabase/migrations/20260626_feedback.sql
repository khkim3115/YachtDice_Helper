-- ============================================================================
-- 마이그레이션: 사용자 피드백(버그/건의/기타) (#31)
-- 운영 DB(wrdeqbqwxnmjsbwwnatx)에 증분 적용 완료. schema.sql(전체 소스)과 동일 결과.
--   - feedback 테이블: 완전 비공개(RLS on, SELECT 정책 없음, revoke all) → 운영자(서비스 롤)만 조회
--   - submit_feedback RPC(유일한 쓰기 표면): 허니팟 + 종류/길이 검증 + 세션당(5/10분)·전역(30/분) 레이트리밋
--   - cleanup_feedback(): 운영자/서비스 롤 전용 보존정책(anon/authenticated grant 없음)
-- 스팸 방어는 best-effort(익명 세션 무료 재발급) — 실질 방어는 대시보드 '익명 가입' IP 레이트리밋 +
-- (후속 단계) Cloudflare Turnstile 에 의존.
-- ============================================================================
begin;

create table if not exists public.feedback (
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
create index if not exists feedback_triage_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;
-- 완전 비공개: DML 뿐 아니라 잔여 권한(REFERENCES/TRIGGER/TRUNCATE 등)까지 전부 회수.
revoke all on public.feedback from anon, authenticated;

-- 제출(유일한 쓰기 표면). 익명 세션(auth.uid()) 필수 → 레이트리밋 키.
create or replace function public.submit_feedback(
  p_kind text, p_message text, p_contact text default null,
  p_meta jsonb default '{}'::jsonb, p_hp text default '')
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  -- 허니팟: 채워졌으면 봇 → 성공인 척 조용히 무시.
  if coalesce(p_hp, '') <> '' then return; end if;
  if uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('bug','feature','other') then raise exception 'invalid kind'; end if;
  if char_length(coalesce(p_message,'')) < 1 or char_length(p_message) > 2000 then
    raise exception 'message length must be 1..2000';
  end if;
  if p_contact is not null and char_length(p_contact) > 200 then
    raise exception 'contact too long';
  end if;
  if p_meta is not null and length(p_meta::text) > 4000 then raise exception 'meta too large'; end if;
  -- 세션당 레이트리밋(best-effort): 10분 5건.
  if (select count(*) from public.feedback
        where user_id = uid and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'too many submissions';
  end if;
  -- 전역 분당 백스톱.
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

-- 정리(운영자/서비스 롤 전용 — anon/authenticated 에 grant 하지 않음).
create or replace function public.cleanup_feedback()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.feedback where
       status = 'spam'
    or (status in ('done','triaged') and created_at < now() - interval '90 days');
end $$;

-- 실행 권한: 두 함수 모두 잠그고 submit_feedback 만 anon/authenticated 부여(cleanup 은 서비스 롤 전용).
revoke execute on function public.submit_feedback(text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.cleanup_feedback() from public, anon, authenticated;
grant execute on function public.submit_feedback(text, text, text, jsonb, text) to anon, authenticated;

commit;
