create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null,
  awarded_by uuid references public.profiles(id) on delete set null,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

alter table public.profiles
  add column if not exists selected_badge_key text;

alter table public.user_badges enable row level security;

drop policy if exists "Users can read their badges" on public.user_badges;
drop policy if exists "Admins can read badges" on public.user_badges;
drop policy if exists "Admins can award badges" on public.user_badges;
drop policy if exists "Admins can update badges" on public.user_badges;

create policy "Users can read their badges"
  on public.user_badges
  for select
  using (auth.uid() = user_id);

create policy "Admins can read badges"
  on public.user_badges
  for select
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

create policy "Admins can award badges"
  on public.user_badges
  for insert
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

create policy "Admins can update badges"
  on public.user_badges
  for update
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

insert into public.user_badges (user_id, badge_key)
select id, 'veteran'
from public.profiles
on conflict (user_id, badge_key) do nothing;
