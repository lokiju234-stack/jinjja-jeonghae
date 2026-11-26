-- 002 — 여행 플래너 확장: 멤버·초대, 날짜 방식(투표/확정/미정), 일정표, 준비물, 정산, 다이어리(사진), 회원 탈퇴
-- schema.sql 을 먼저 실행한 프로젝트에서 SQL Editor 로 실행하세요. 여러 번 실행해도 안전합니다.

-- ─────────────────────────────────────────────
-- 1) 일정(여행) 테이블 확장
-- ─────────────────────────────────────────────
alter table public.events alter column start_date drop not null;
alter table public.events alter column end_date drop not null;
alter table public.events add column if not exists date_mode text not null default 'poll';
alter table public.events add column if not exists confirmed_start date;
alter table public.events add column if not exists confirmed_end date;
alter table public.events add column if not exists trip_days smallint;

do $$ begin
  alter table public.events add constraint events_date_mode_chk check (date_mode in ('poll','fixed','undecided'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_poll_range_chk
    check (date_mode <> 'poll' or (start_date is not null and end_date is not null));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_fixed_chk
    check (date_mode <> 'fixed' or (confirmed_start is not null and confirmed_end is not null));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_confirmed_chk
    check ((confirmed_start is null) = (confirmed_end is null)
       and (confirmed_start is null or (confirmed_end >= confirmed_start and confirmed_end - confirmed_start <= 59)));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_trip_days_chk check (trip_days is null or trip_days between 1 and 60);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────
-- 2) 멤버 (초대 링크로 참여한 사람)
-- ─────────────────────────────────────────────
create table if not exists public.event_members (
  event_id     uuid not null references public.events(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','member')),
  display_name text not null check (char_length(display_name) between 1 and 30),
  joined_at    timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_members_user_idx on public.event_members(user_id);

-- 기존 데이터: 방장과 응답한 사람을 멤버로
insert into public.event_members (event_id, user_id, role, display_name)
  select id, owner_id, 'owner', coalesce(nullif(owner_name, ''), '방장') from public.events
  on conflict do nothing;
insert into public.event_members (event_id, user_id, role, display_name)
  select event_id, user_id, 'member', display_name from public.responses where user_id is not null
  on conflict do nothing;

create or replace function public.add_owner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into event_members (event_id, user_id, role, display_name)
  values (new.id, new.owner_id, 'owner', coalesce(nullif(new.owner_name, ''), '방장'))
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists events_add_owner on public.events;
create trigger events_add_owner after insert on public.events
  for each row execute function public.add_owner_member();

create or replace function public.is_member(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_members where event_id = eid and user_id = auth.uid());
$$;

-- ─────────────────────────────────────────────
-- 3) 플래너 테이블
-- ─────────────────────────────────────────────
create table if not exists public.plan_items (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  day_index  smallint check (day_index between 0 and 59),          -- null = 아이디어 보관함
  sort       double precision not null default 0,
  start_time time,
  title      text not null check (char_length(title) between 1 and 80),
  category   text not null default 'etc' check (category in ('move','food','sight','stay','activity','shop','etc')),
  place      text not null default '' check (char_length(place) <= 120),
  cost       integer not null default 0 check (cost between 0 and 100000000),
  memo       text not null default '' check (char_length(memo) <= 500),
  link       text not null default '' check (char_length(link) <= 500 and (link = '' or link ~* '^https?://')),
  done       boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_items_event_idx on public.plan_items(event_id);

create table if not exists public.checklist_items (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 100),
  assignee   uuid references auth.users(id) on delete set null,
  done       boolean not null default false,
  sort       double precision not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists checklist_items_event_idx on public.checklist_items(event_id);

create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 60),
  amount     integer not null check (amount between 1 and 100000000),
  paid_by    uuid not null references auth.users(id) on delete cascade,
  split      uuid[] not null check (cardinality(split) between 1 and 100),
  spent_on   date,
  memo       text not null default '' check (char_length(memo) <= 200),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists expenses_event_idx on public.expenses(event_id);

create table if not exists public.diary_entries (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date,
  title      text not null default '' check (char_length(title) <= 60),
  body       text not null default '' check (char_length(body) <= 5000),
  mood       text not null default '' check (mood in ('', 'best', 'good', 'soso', 'tired')),
  photos     text[] not null default '{}' check (cardinality(photos) <= 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(title) > 0 or char_length(body) > 0 or cardinality(photos) > 0)
);
create index if not exists diary_entries_event_idx on public.diary_entries(event_id);

drop trigger if exists plan_items_touch on public.plan_items;
create trigger plan_items_touch before update on public.plan_items for each row execute function public.touch_updated_at();
drop trigger if exists diary_entries_touch on public.diary_entries;
create trigger diary_entries_touch before update on public.diary_entries for each row execute function public.touch_updated_at();

-- 다이어리 사진 경로는 반드시 "<event_id>/파일명" 형태 (다른 여행의 사진을 끌어다 쓰지 못하게)
create or replace function public.diary_photos_ok(eid uuid, paths text[]) returns boolean
language sql immutable as $$
  select coalesce(bool_and(p ~ ('^' || eid::text || '/[A-Za-z0-9_-]{8,64}\.(jpg|jpeg|png|webp)$')), true) from unnest(paths) p;
$$;
do $$ begin
  alter table public.diary_entries add constraint diary_photos_path_chk check (public.diary_photos_ok(event_id, photos));
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────
-- 4) 행 수준 보안(RLS)
-- ─────────────────────────────────────────────
alter table public.event_members   enable row level security;
alter table public.plan_items      enable row level security;
alter table public.checklist_items enable row level security;
alter table public.expenses        enable row level security;
alter table public.diary_entries   enable row level security;

-- events: 방장 또는 멤버만 읽기
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id));

-- responses: 멤버만 읽기/쓰기
drop policy if exists responses_select on public.responses;
drop policy if exists responses_insert on public.responses;
drop policy if exists responses_update on public.responses;
create policy responses_select on public.responses for select to authenticated
  using (public.is_member(event_id));
create policy responses_insert on public.responses for insert to authenticated
  with check (
    public.is_event_open(event_id) and public.is_member(event_id) and created_by = auth.uid() and (
      user_id = auth.uid() or (user_id is null and public.is_event_owner(event_id))
    )
  );
create policy responses_update on public.responses for update to authenticated
  using (user_id = auth.uid() or (user_id is null and public.is_event_owner(event_id)))
  with check (
    public.is_event_open(event_id) and public.is_member(event_id) and (
      user_id = auth.uid() or (user_id is null and public.is_event_owner(event_id))
    )
  );

-- event_members: 멤버끼리 서로 보기, 자기 표시 이름만 수정, 나가기/내보내기는 RPC 로
drop policy if exists members_select on public.event_members;
drop policy if exists members_update on public.event_members;
create policy members_select on public.event_members for select to authenticated
  using (public.is_member(event_id));
create policy members_update on public.event_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- plan_items / checklist_items: 멤버 누구나 함께 편집, 삭제는 작성자나 방장
do $$
declare t text;
begin
  foreach t in array array['plan_items','checklist_items'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member(event_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.is_member(event_id) and created_by = auth.uid())', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.is_member(event_id)) with check (public.is_member(event_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_member(event_id) and (created_by = auth.uid() or public.is_event_owner(event_id)))', t);
  end loop;
end $$;

-- expenses: 낸 사람과 나눌 사람은 모두 멤버여야 함
create or replace function public.all_members(eid uuid, ids uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from unnest(ids) u where not exists (select 1 from event_members m where m.event_id = eid and m.user_id = u));
$$;
drop policy if exists expenses_select on public.expenses;
drop policy if exists expenses_insert on public.expenses;
drop policy if exists expenses_update on public.expenses;
drop policy if exists expenses_delete on public.expenses;
create policy expenses_select on public.expenses for select to authenticated using (public.is_member(event_id));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.is_member(event_id) and created_by = auth.uid() and public.all_members(event_id, split || paid_by));
create policy expenses_update on public.expenses for update to authenticated
  using (public.is_member(event_id) and (created_by = auth.uid() or paid_by = auth.uid() or public.is_event_owner(event_id)))
  with check (public.is_member(event_id) and public.all_members(event_id, split || paid_by));
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.is_member(event_id) and (created_by = auth.uid() or paid_by = auth.uid() or public.is_event_owner(event_id)));

-- diary_entries: 멤버가 읽고, 자기 글만 쓰고 고침, 삭제는 작성자나 방장
drop policy if exists diary_select on public.diary_entries;
drop policy if exists diary_insert on public.diary_entries;
drop policy if exists diary_update on public.diary_entries;
drop policy if exists diary_delete on public.diary_entries;
create policy diary_select on public.diary_entries for select to authenticated using (public.is_member(event_id));
create policy diary_insert on public.diary_entries for insert to authenticated
  with check (public.is_member(event_id) and author_id = auth.uid());
create policy diary_update on public.diary_entries for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and public.is_member(event_id));
create policy diary_delete on public.diary_entries for delete to authenticated
  using (author_id = auth.uid() or public.is_event_owner(event_id));

-- ─────────────────────────────────────────────
-- 5) 테이블 권한 (실제 범위는 RLS 가 결정)
-- ─────────────────────────────────────────────
revoke all on public.event_members, public.plan_items, public.checklist_items, public.expenses, public.diary_entries from anon;
revoke all on public.event_members from authenticated;
grant select on public.event_members to authenticated;
grant update (display_name) on public.event_members to authenticated;
grant select, insert, update, delete on public.plan_items, public.checklist_items, public.expenses, public.diary_entries to authenticated;

-- ─────────────────────────────────────────────
-- 6) 링크·멤버 관련 함수
-- ─────────────────────────────────────────────
create or replace function public.get_event(p_code text) returns setof public.events
language sql stable security definer set search_path = public as $$
  select * from events where code = p_code and is_member(id);
$$;

create or replace function public.list_responses(p_code text) returns setof public.responses
language sql stable security definer set search_path = public as $$
  select r.* from responses r join events e on e.id = r.event_id
  where e.code = p_code and is_member(e.id) order by r.created_at;
$$;

-- 초대 링크로 들어온 사람에게 보여 줄 최소 정보 (응답·멤버 명단은 없음)
drop function if exists public.event_preview(text);
create or replace function public.event_preview(p_code text)
returns table (id uuid, title text, owner_name text, date_mode text, start_date date, end_date date,
               confirmed_start date, confirmed_end date, trip_days smallint, member_count bigint, is_member boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.owner_name, e.date_mode, e.start_date, e.end_date, e.confirmed_start, e.confirmed_end, e.trip_days,
         (select count(*) from event_members m where m.event_id = e.id), is_member(e.id)
  from events e where e.code = p_code;
$$;

create or replace function public.join_event(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare eid uuid; n text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select id into eid from events where code = p_code;
  if eid is null then raise exception 'not found'; end if;
  if char_length(n) < 1 or char_length(n) > 30 then raise exception 'invalid name'; end if;
  if (select count(*) from event_members where event_id = eid) >= 100 then raise exception 'member limit'; end if;
  insert into event_members (event_id, user_id, role, display_name) values (eid, auth.uid(), 'member', n)
  on conflict (event_id, user_id) do nothing;
  return eid;
end $$;

create or replace function public.leave_event(eid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from event_members where event_id = eid and user_id = auth.uid() and role = 'owner') then
    raise exception 'owner cannot leave';
  end if;
  delete from responses where event_id = eid and user_id = auth.uid();
  delete from event_members where event_id = eid and user_id = auth.uid();
end $$;

create or replace function public.remove_member(eid uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_event_owner(eid) then raise exception 'not owner'; end if;
  if uid = auth.uid() then raise exception 'cannot remove owner'; end if;
  delete from responses where event_id = eid and user_id = uid;
  delete from event_members where event_id = eid and user_id = uid;
end $$;

-- 초대 링크 다시 만들기: 예전 링크는 더 이상 열리지 않음 (이미 참여한 멤버는 그대로)
create or replace function public.rotate_code(eid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text; i int;
begin
  if not is_event_owner(eid) then raise exception 'not owner'; end if;
  for i in 1..5 loop
    c := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 12);
    begin
      update events set code = c where id = eid;
      return c;
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'could not rotate';
end $$;

drop function if exists public.my_events();
create or replace function public.my_events()
returns table (
  id uuid, code text, title text, owner_name text, date_mode text, start_date date, end_date date,
  confirmed_start date, confirmed_end date, trip_days smallint, default_nights smallint, closed boolean,
  created_at timestamptz, is_owner boolean, member_count bigint, response_count bigint
)
language sql stable security definer set search_path = public as $$
  select e.id, e.code, e.title, e.owner_name, e.date_mode, e.start_date, e.end_date,
         e.confirmed_start, e.confirmed_end, e.trip_days, e.default_nights, e.closed, e.created_at,
         e.owner_id = auth.uid(),
         (select count(*) from event_members m where m.event_id = e.id),
         (select count(*) from responses r where r.event_id = e.id)
  from events e
  where exists (select 1 from event_members m where m.event_id = e.id and m.user_id = auth.uid())
  order by e.created_at desc;
$$;

-- 회원 탈퇴: 내 계정과 내가 만든 여행(및 그 안의 모든 데이터), 내 응답·멤버십·글을 삭제
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- 함수 실행 권한: 로그인한 사용자만
do $$
declare f text;
begin
  foreach f in array array[
    'public.is_member(uuid)', 'public.all_members(uuid, uuid[])', 'public.get_event(text)', 'public.list_responses(text)',
    'public.event_preview(text)', 'public.join_event(text, text)', 'public.leave_event(uuid)', 'public.remove_member(uuid, uuid)',
    'public.rotate_code(uuid)', 'public.my_events()', 'public.delete_my_account()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.add_owner_member() from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- 7) 다이어리 사진 저장소 (비공개, 멤버만 접근)
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-photos', 'trip-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create or replace function public.photo_event(name text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(name, '/', 1)::uuid;
exception when others then return null;
end $$;

drop policy if exists trip_photos_select on storage.objects;
drop policy if exists trip_photos_insert on storage.objects;
drop policy if exists trip_photos_delete on storage.objects;
create policy trip_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'trip-photos' and public.is_member(public.photo_event(name)));
create policy trip_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-photos' and public.is_member(public.photo_event(name))
              and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{8,64}\.(jpg|jpeg|png|webp)$');
create policy trip_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trip-photos' and (owner_id = auth.uid()::text or public.is_event_owner(public.photo_event(name))));

-- ─────────────────────────────────────────────
-- 8) 보안 점검 보완: 모든 함수의 search_path 고정
-- ─────────────────────────────────────────────
alter function public.touch_updated_at() set search_path = public;
alter function public.diary_photos_ok(uuid, text[]) set search_path = public;
alter function public.photo_event(text) set search_path = public;
