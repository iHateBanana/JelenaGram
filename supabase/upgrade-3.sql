-- Run once in the Supabase SQL editor. Safe to re-run. Speeds up reads; who can see what does not change.

-- Indexes for the sort orders the app uses (feed, new-photo counts, saved photos).
create index if not exists photos_created_idx on photos (created_at desc);
create index if not exists favorites_user_idx on favorites (user_id, created_at desc);

-- A bare is_allowed() or auth.uid() in a policy can re-run for every row, and a feed request touches
-- thousands of rows across photos, albums, comments and favorites. Wrapped in (select ...), each runs
-- once per query.
begin;

drop policy if exists "read allowed" on allowed_users;
create policy "read allowed" on allowed_users for select using ((select is_allowed()));

drop policy if exists "read albums" on albums;
create policy "read albums" on albums for select using ((select is_allowed()));

drop policy if exists "read photos" on photos;
create policy "read photos" on photos for select using ((select is_allowed()));

drop policy if exists "read likes" on likes;
create policy "read likes" on likes for select using ((select is_allowed()));

drop policy if exists "read comments" on comments;
create policy "read comments" on comments for select using ((select is_allowed()));

drop policy if exists "read own favorites" on favorites;
create policy "read own favorites" on favorites for select using (user_id = (select auth.uid()));

drop policy if exists "read photo files" on storage.objects;
create policy "read photo files" on storage.objects for select
  using (bucket_id = 'photos' and (select is_allowed()));

commit;
