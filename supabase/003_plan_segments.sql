-- 003 — 일정표 뼈대(구간): 예) 1~3일차 서울, 3~5일차 부산
-- 멤버 누구나 함께 정하고 고칠 수 있고, 삭제는 만든 사람이나 방장만.
create table if not exists public.plan_segments (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 20),
  start_day  smallint not null check (start_day between 0 and 59),
  end_day    smallint not null check (end_day between 0 and 59),
  color      text not null default 'green' check (color in ('green','red','blue','amber','purple','teal')),
  sort       double precision not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_day >= start_day)
);
create index if not exists plan_segments_event_idx on public.plan_segments(event_id);
alter table public.plan_segments enable row level security;

drop policy if exists plan_segments_select on public.plan_segments;
drop policy if exists plan_segments_insert on public.plan_segments;
drop policy if exists plan_segments_update on public.plan_segments;
drop policy if exists plan_segments_delete on public.plan_segments;
create policy plan_segments_select on public.plan_segments for select to authenticated using (public.is_member(event_id));
create policy plan_segments_insert on public.plan_segments for insert to authenticated with check (public.is_member(event_id) and created_by = auth.uid());
create policy plan_segments_update on public.plan_segments for update to authenticated using (public.is_member(event_id)) with check (public.is_member(event_id));
create policy plan_segments_delete on public.plan_segments for delete to authenticated using (public.is_member(event_id) and (created_by = auth.uid() or public.is_event_owner(event_id)));

revoke all on public.plan_segments from anon;
grant select, insert, update, delete on public.plan_segments to authenticated;
