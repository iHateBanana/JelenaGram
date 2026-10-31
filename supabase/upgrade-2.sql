-- Run once in the Supabase SQL editor (existing installs). Safe to re-run.

-- Threaded replies
alter table comments add column if not exists parent_id uuid references comments(id) on delete cascade;
create index if not exists comments_parent_idx on comments (parent_id);

-- Favorites (private to each person)
create table if not exists favorites (
  photo_id uuid not null references photos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
alter table favorites enable row level security;
drop policy if exists "read own favorites" on favorites;
drop policy if exists "add own favorite" on favorites;
drop policy if exists "remove own favorite" on favorites;
create policy "read own favorites" on favorites for select using (user_id = auth.uid());
create policy "add own favorite" on favorites for insert with check (is_allowed() and user_id = auth.uid());
create policy "remove own favorite" on favorites for delete using (user_id = auth.uid());

-- Let each person rename themselves
drop policy if exists "update own name" on allowed_users;
create policy "update own name" on allowed_users for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
