-- 얘들아 이제는 진짜 정해야해 — Supabase 데이터베이스 스키마
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여 넣고 Run 하세요.
-- 여러 번 실행해도 안전하도록 작성했습니다.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- 일정(방) : 방장이 만들고 링크(code)로 공유
-- ─────────────────────────────────────────────
create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[a-z0-9]{6,16}$'),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_name     text not null default '' check (char_length(owner_name) <= 30),
  title          text not null check (char_length(title) between 1 and 60),
  description    text not null default '' check (char_length(description) <= 500),
  start_date     date not null,
  end_date       date not null,
  default_nights smallint not null default 1 check (default_nights between 0 and 6),
  closed         boolean not null default false,
  created_at     timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 92)
);

-- ─────────────────────────────────────────────
-- 응답 : 참여자 1명당 1행. user_id 가 null 이면 방장이 대신 입력한 행
-- ─────────────────────────────────────────────
create table if not exists public.responses (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  created_by   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  rest         text not null default 'ok' check (rest in ('ok', 'no')),
  days         jsonb not null default '{}'::jsonb
                 check (jsonb_typeof(days) = 'object' and pg_column_size(days) < 16000),
  note         text not null default '' check (char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists responses_event_idx on public.responses(event_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists responses_touch on public.responses;
create trigger responses_touch before update on public.responses
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────
-- 권한 헬퍼
-- ─────────────────────────────────────────────
create or replace function public.is_event_owner(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events where id = eid and owner_id = auth.uid());
$$;

create or replace function public.is_event_open(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events where id = eid and not closed);
$$;

-- ─────────────────────────────────────────────
-- 행 수준 보안(RLS)
-- 테이블을 직접 읽는 건 본인/방장만. 링크를 아는 사람은 아래 RPC 로만 조회.
-- ─────────────────────────────────────────────
alter table public.events    enable row level security;
alter table public.responses enable row level security;

drop policy if exists events_select on public.events;
drop policy if exists events_insert on public.events;
drop policy if exists events_update on public.events;
drop policy if exists events_delete on public.events;
create policy events_select on public.events for select to authenticated using (owner_id = auth.uid());
create policy events_insert on public.events for insert to authenticated with check (owner_id = auth.uid());
create policy events_update on public.events for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy events_delete on public.events for delete to authenticated using (owner_id = auth.uid());

drop policy if exists responses_select on public.responses;
drop policy if exists responses_insert on public.responses;
drop policy if exists responses_update on public.responses;
drop policy if exists responses_delete on public.responses;
create policy responses_select on public.responses for select to authenticated
  using (user_id = auth.uid() or public.is_event_owner(event_id));
create policy responses_insert on public.responses for insert to authenticated
  with check (
    public.is_event_open(event_id) and created_by = auth.uid() and (
      user_id = auth.uid()
      or (user_id is null and public.is_event_owner(event_id))
    )
  );
create policy responses_update on public.responses for update to authenticated
  using (user_id = auth.uid() or (user_id is null and public.is_event_owner(event_id)))
  with check (
    public.is_event_open(event_id) and (
      user_id = auth.uid()
      or (user_id is null and public.is_event_owner(event_id))
    )
  );
create policy responses_delete on public.responses for delete to authenticated
  using (user_id = auth.uid() or public.is_event_owner(event_id));

-- ─────────────────────────────────────────────
-- 링크(code)로 조회하는 함수 — 로그인한 사용자만
-- ─────────────────────────────────────────────
create or replace function public.get_event(p_code text) returns setof public.events
language sql stable security definer set search_path = public as $$
  select * from events where code = p_code;
$$;

create or replace function public.list_responses(p_code text) returns setof public.responses
language sql stable security definer set search_path = public as $$
  select r.* from responses r join events e on e.id = r.event_id
  where e.code = p_code order by r.created_at;
$$;

create or replace function public.my_events()
returns table (
  id uuid, code text, title text, owner_name text, start_date date, end_date date,
  default_nights smallint, closed boolean, created_at timestamptz,
  is_owner boolean, response_count bigint
)
language sql stable security definer set search_path = public as $$
  select e.id, e.code, e.title, e.owner_name, e.start_date, e.end_date,
         e.default_nights, e.closed, e.created_at,
         e.owner_id = auth.uid(),
         (select count(*) from responses r where r.event_id = e.id)
  from events e
  where e.owner_id = auth.uid()
     or exists (select 1 from responses r where r.event_id = e.id and r.user_id = auth.uid())
  order by e.created_at desc;
$$;

-- 테이블 접근 권한 (실제로 무엇을 볼 수 있는지는 위 RLS 규칙이 결정)
revoke all on public.events, public.responses from anon;
grant select, insert, update, delete on public.events, public.responses to authenticated;

revoke execute on function public.is_event_owner(uuid)  from public, anon;
revoke execute on function public.is_event_open(uuid)   from public, anon;
grant  execute on function public.is_event_owner(uuid)  to authenticated;
grant  execute on function public.is_event_open(uuid)   to authenticated;
revoke execute on function public.get_event(text)       from public, anon;
revoke execute on function public.list_responses(text)  from public, anon;
revoke execute on function public.my_events()           from public, anon;
grant  execute on function public.get_event(text)       to authenticated;
grant  execute on function public.list_responses(text)  to authenticated;
grant  execute on function public.my_events()           to authenticated;
