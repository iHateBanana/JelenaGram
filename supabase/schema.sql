-- Run in the Supabase SQL editor.
-- BEFORE running: Authentication > Providers > Email: disable "Allow new users to sign up".
-- Then create the two users under Authentication > Users (email + password),
-- then run the INSERT into allowed_users at the bottom with their ids.

create table allowed_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
);

create or replace function is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from allowed_users where user_id = auth.uid());
$$;

create table albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  cover_path text,
  source_album_id text,
  removed_source_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Already ran the schema before? Run just this line in the SQL editor:
-- alter table albums add column if not exists removed_source_ids text[] not null default '{}';

create table photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references albums(id) on delete cascade,
  path text not null,
  width int,
  height int,
  taken_at timestamptz not null default now(),
  source_asset_id text,
  created_at timestamptz not null default now(),
  unique (album_id, source_asset_id)
);
create index photos_album_idx on photos (album_id, taken_at desc);
create index photos_taken_idx on photos (taken_at desc);

create table likes (
  photo_id uuid not null references photos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  count int not null default 0,
  primary key (photo_id, user_id)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references photos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  body text not null check (char_length(body) between 1 and 2000),
  parent_id uuid references comments(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index comments_photo_idx on comments (photo_id, created_at);

-- Favorites + rename policy: already have a database? Run supabase/upgrade-2.sql instead.
create table favorites (
  photo_id uuid not null references photos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
alter table favorites enable row level security;
create policy "read own favorites" on favorites for select using (user_id = auth.uid());
create policy "add own favorite" on favorites for insert with check (is_allowed() and user_id = auth.uid());
create policy "remove own favorite" on favorites for delete using (user_id = auth.uid());
create policy "update own name" on allowed_users for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Adds n likes for the current user on a photo.
create or replace function add_likes(p_photo uuid, n int default 1) returns int
language plpgsql security definer set search_path = public as $$
declare result int;
begin
  if not is_allowed() then raise exception 'not allowed'; end if;
  insert into likes (photo_id, user_id, count) values (p_photo, auth.uid(), greatest(n, 1))
  on conflict (photo_id, user_id) do update set count = likes.count + greatest(n, 1)
  returning count into result;
  return result;
end $$;

alter table allowed_users enable row level security;
alter table albums enable row level security;
alter table photos enable row level security;
alter table likes enable row level security;
alter table comments enable row level security;

create policy "read allowed" on allowed_users for select using (is_allowed());

create policy "read albums" on albums for select using (is_allowed());
create policy "insert own album" on albums for insert with check (is_allowed() and owner_id = auth.uid());
create policy "update own album" on albums for update using (owner_id = auth.uid());
create policy "delete own album" on albums for delete using (owner_id = auth.uid());

create policy "read photos" on photos for select using (is_allowed());
create policy "insert own photo" on photos for insert
  with check (is_allowed() and exists (select 1 from albums a where a.id = album_id and a.owner_id = auth.uid()));
create policy "delete own photo" on photos for delete
  using (exists (select 1 from albums a where a.id = album_id and a.owner_id = auth.uid()));

create policy "read likes" on likes for select using (is_allowed());
-- likes are written only through add_likes()

create policy "read comments" on comments for select using (is_allowed());
create policy "insert own comment" on comments for insert with check (is_allowed() and user_id = auth.uid());
create policy "delete own comment" on comments for delete using (user_id = auth.uid());

-- Private storage bucket; objects are stored under "<user_id>/<album_id>/<file>".
insert into storage.buckets (id, name, public) values ('photos', 'photos', false);

create policy "read photo files" on storage.objects for select
  using (bucket_id = 'photos' and is_allowed());
create policy "upload own photo files" on storage.objects for insert
  with check (bucket_id = 'photos' and is_allowed() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own photo files" on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- insert into allowed_users (user_id, display_name) values
--   ('<user-1-uuid>', 'Name 1'),
--   ('<user-2-uuid>', 'Name 2');
