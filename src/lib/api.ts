import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { SourcePhoto } from './media-types';
import { BUCKET, supabase } from './supabase';
import type { Album, AlbumWithCount, Comment, Photo, Profiles } from './types';

const SIGN_SECONDS = 60 * 60;
const MAX_DIMENSION = 1080;
export const PAGE_SIZE = 10;

async function signUrls(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unique, SIGN_SECONDS);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  }
  return out;
}

type RawAlbum = Omit<Album, 'coverUrl'>;

function toAlbum(raw: RawAlbum, urls: Record<string, string>): Album {
  return { ...raw, coverUrl: raw.cover_path ? (urls[raw.cover_path] ?? null) : null };
}

export async function fetchProfiles(): Promise<Profiles> {
  const { data, error } = await supabase.from('allowed_users').select('user_id, display_name');
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.user_id, r.display_name]));
}

type RawPhoto = {
  id: string;
  album_id: string;
  path: string;
  width: number | null;
  height: number | null;
  taken_at: string;
  album: RawAlbum;
};

const PHOTO_SELECT =
  'id, album_id, path, width, height, taken_at, album:albums!inner(id, owner_id, name, cover_path, source_album_id)';

async function enrichPhotos(rows: RawPhoto[], me: string): Promise<Photo[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const urls = await signUrls(rows.flatMap((r) => [r.path, r.album.cover_path]));

  const [likesRes, commentsRes, favRes] = await Promise.all([
    supabase.from('likes').select('photo_id, user_id, count').in('photo_id', ids),
    supabase.from('comments').select('photo_id').in('photo_id', ids),
    supabase.from('favorites').select('photo_id').eq('user_id', me).in('photo_id', ids),
  ]);
  if (likesRes.error) throw likesRes.error;
  if (commentsRes.error) throw commentsRes.error;
  if (favRes.error) throw favRes.error;
  const favSet = new Set((favRes.data ?? []).map((f) => f.photo_id));

  const likes: Record<string, Record<string, number>> = {};
  for (const l of likesRes.data ?? []) {
    (likes[l.photo_id] ??= {})[l.user_id] = l.count;
  }
  const commentCounts: Record<string, number> = {};
  for (const c of commentsRes.data ?? []) {
    commentCounts[c.photo_id] = (commentCounts[c.photo_id] ?? 0) + 1;
  }

  return rows.map((r) => {
    const byUser = likes[r.id] ?? {};
    return {
      id: r.id,
      album_id: r.album_id,
      path: r.path,
      url: urls[r.path] ?? '',
      width: r.width,
      height: r.height,
      taken_at: r.taken_at,
      album: toAlbum(r.album, urls),
      likesByUser: byUser,
      myLikes: byUser[me] ?? 0,
      likeTotal: Object.values(byUser).reduce((a, b) => a + b, 0),
      commentCount: commentCounts[r.id] ?? 0,
      favorited: favSet.has(r.id),
    };
  });
}

/** Feed: newest photos from albums owned by anyone except `me`. */
export async function fetchFeedPage(me: string, page: number): Promise<Photo[]> {
  const from = page * PAGE_SIZE;
  const { data, error } = await supabase
    .from('photos')
    .select(PHOTO_SELECT)
    .neq('album.owner_id', me)
    .order('taken_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
    .overrideTypes<RawPhoto[]>();
  if (error) throw error;
  return enrichPhotos(data ?? [], me);
}

export async function fetchFeedAll(me: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select(PHOTO_SELECT)
    .neq('album.owner_id', me)
    .order('id', { ascending: true })
    .range(0, 499)
    .overrideTypes<RawPhoto[]>();
  if (error) throw error;
  return enrichPhotos(data ?? [], me);
}

export async function fetchAlbumPhotos(albumId: string, me: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select(PHOTO_SELECT)
    .eq('album_id', albumId)
    .order('taken_at', { ascending: false })
    .order('id', { ascending: false })
    .range(0, 499)
    .overrideTypes<RawPhoto[]>();
  if (error) throw error;
  return enrichPhotos(data ?? [], me);
}

const ALBUM_SELECT = 'id, owner_id, name, cover_path, source_album_id, photos(count)';

type RawAlbumWithCount = RawAlbum & { photos: { count: number }[] };

async function withUrls(rows: RawAlbumWithCount[]): Promise<AlbumWithCount[]> {
  const urls = await signUrls(rows.map((r) => r.cover_path));
  return rows.map((r) => ({ ...toAlbum(r, urls), photoCount: r.photos?.[0]?.count ?? 0 }));
}

export async function fetchAlbum(albumId: string): Promise<AlbumWithCount | null> {
  const { data, error } = await supabase
    .from('albums')
    .select(ALBUM_SELECT)
    .eq('id', albumId)
    .maybeSingle()
    .overrideTypes<RawAlbumWithCount>();
  if (error) throw error;
  if (!data) return null;
  return (await withUrls([data]))[0];
}

export async function fetchMyAlbums(me: string): Promise<AlbumWithCount[]> {
  const { data, error } = await supabase
    .from('albums')
    .select(ALBUM_SELECT)
    .eq('owner_id', me)
    .order('created_at', { ascending: false })
    .overrideTypes<RawAlbumWithCount[]>();
  if (error) throw error;
  return withUrls(data ?? []);
}

export async function addLike(photoId: string): Promise<number> {
  const { data, error } = await supabase.rpc('add_likes', { p_photo: photoId, n: 1 });
  if (error) throw error;
  return data as number;
}

export async function fetchComments(photoId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, photo_id, user_id, body, parent_id, created_at')
    .eq('photo_id', photoId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type AlbumComment = Comment & { photoUrl: string };

export async function fetchAlbumComments(albumId: string): Promise<AlbumComment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, photo_id, user_id, body, parent_id, created_at, photo:photos!inner(path, album_id)')
    .eq('photo.album_id', albumId)
    .order('created_at', { ascending: false })
    .limit(300)
    .overrideTypes<(Comment & { photo: { path: string; album_id: string } })[]>();
  if (error) throw error;
  const rows = data ?? [];
  const urls = await signUrls(rows.map((r) => r.photo.path));
  return rows.map(({ photo, ...c }) => ({ ...c, photoUrl: urls[photo.path] ?? '' }));
}

export async function addComment(photoId: string, body: string, parentId: string | null = null): Promise<void> {
  const { error } = await supabase.from('comments').insert({ photo_id: photoId, body: body.trim(), parent_id: parentId });
  if (error) throw error;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

export async function createAlbum(name: string, sourceAlbumId: string | null): Promise<Album> {
  const { data, error } = await supabase
    .from('albums')
    .insert({ name: name.trim(), source_album_id: sourceAlbumId })
    .select('id, owner_id, name, cover_path, source_album_id')
    .single();
  if (error) throw error;
  return { ...data, coverUrl: null };
}

export async function deleteAlbum(albumId: string, me: string): Promise<void> {
  const { data: files } = await supabase.from('photos').select('path').eq('album_id', albumId);
  const paths = (files ?? []).map((f) => f.path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from('albums').delete().eq('id', albumId).eq('owner_id', me);
  if (error) throw error;
}

/** Removes a photo from the app only. Its source key is remembered so Sync doesn't bring it back. */
export async function deletePhoto(photo: Photo): Promise<void> {
  const { data: row } = await supabase.from('photos').select('source_asset_id').eq('id', photo.id).maybeSingle();
  const { error } = await supabase.from('photos').delete().eq('id', photo.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([photo.path]);

  if (row?.source_asset_id) {
    const { data: album } = await supabase
      .from('albums')
      .select('removed_source_ids')
      .eq('id', photo.album_id)
      .maybeSingle();
    const removed: string[] = album?.removed_source_ids ?? [];
    if (!removed.includes(row.source_asset_id)) {
      await supabase
        .from('albums')
        .update({ removed_source_ids: [...removed, row.source_asset_id] })
        .eq('id', photo.album_id);
    }
  }

  if (photo.album.cover_path === photo.path) {
    const { data: next } = await supabase
      .from('photos')
      .select('path')
      .eq('album_id', photo.album_id)
      .order('created_at', { ascending: true })
      .limit(1);
    await supabase
      .from('albums')
      .update({ cover_path: next?.[0]?.path ?? null })
      .eq('id', photo.album_id);
  }
}

export async function setAlbumCover(albumId: string, path: string): Promise<void> {
  const { error } = await supabase.from('albums').update({ cover_path: path }).eq('id', albumId);
  if (error) throw error;
}

async function processForUpload(uri: string) {
  const context = ImageManipulator.manipulate(uri);
  const probe = await context.renderAsync();
  const longest = Math.max(probe.width, probe.height);
  const resized =
    longest > MAX_DIMENSION
      ? await ImageManipulator.manipulate(uri)
          .resize(probe.width >= probe.height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION })
          .renderAsync()
      : probe;
  const result = await resized.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return result;
}

function randomName() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
}

export type SyncProgress = { done: number; total: number };

/** Uploads photos not yet in the album (deduped by source key). Returns number uploaded. */
export async function syncAlbum(
  album: Pick<Album, 'id' | 'owner_id' | 'cover_path'>,
  sources: SourcePhoto[],
  onProgress?: (p: SyncProgress) => void,
): Promise<number> {
  const { data: existing, error } = await supabase
    .from('photos')
    .select('source_asset_id')
    .eq('album_id', album.id);
  if (error) throw error;
  const { data: albumRow } = await supabase
    .from('albums')
    .select('removed_source_ids')
    .eq('id', album.id)
    .maybeSingle();
  const known = new Set<string>([
    ...(existing ?? []).map((r) => r.source_asset_id),
    ...((albumRow?.removed_source_ids as string[] | undefined) ?? []),
  ]);
  const todo = sources.filter((s) => !known.has(s.key));

  let coverSet = !!album.cover_path;
  let done = 0;
  onProgress?.({ done, total: todo.length });

  for (const source of todo) {
    try {
      const localUri = await source.getUri();
      const processed = await processForUpload(localUri);
      const body = await (await fetch(processed.uri)).arrayBuffer();
      const path = `${album.owner_id}/${album.id}/${randomName()}`;
      const upload = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' });
      if (upload.error) throw upload.error;
      const insert = await supabase.from('photos').insert({
        album_id: album.id,
        path,
        width: processed.width,
        height: processed.height,
        taken_at: source.takenAt,
        source_asset_id: source.key,
      });
      if (insert.error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insert.error;
      }
      if (!coverSet) {
        await supabase.from('albums').update({ cover_path: path }).eq('id', album.id);
        coverSet = true;
      }
    } catch (e) {
      console.warn('Skipping photo that failed to upload', source.key, e);
    }
    done += 1;
    onProgress?.({ done, total: todo.length });
  }
  return todo.length;
}


export async function setFavorite(photoId: string, me: string, on: boolean): Promise<void> {
  const { error } = on
    ? await supabase.from('favorites').upsert({ photo_id: photoId, user_id: me }, { onConflict: 'photo_id,user_id' })
    : await supabase.from('favorites').delete().eq('photo_id', photoId).eq('user_id', me);
  if (error) throw error;
}

export async function fetchFavorites(me: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select(`created_at, photo:photos!inner(${PHOTO_SELECT})`)
    .eq('user_id', me)
    .order('created_at', { ascending: false })
    .limit(300)
    .overrideTypes<{ created_at: string; photo: RawPhoto }[]>();
  if (error) throw error;
  return enrichPhotos((data ?? []).map((r) => r.photo), me);
}

export async function updateDisplayName(me: string, name: string): Promise<void> {
  const { error } = await supabase.from('allowed_users').update({ display_name: name.trim() }).eq('user_id', me);
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export type Activity = { newPhotos: number; newComments: number };

export async function fetchActivity(me: string, feedSeen: string, commentsSeen: string): Promise<Activity> {
  const [photos, comments] = await Promise.all([
    supabase
      .from('photos')
      .select('id, album:albums!inner(owner_id)', { count: 'exact', head: true })
      .neq('album.owner_id', me)
      .gt('created_at', feedSeen),
    supabase
      .from('comments')
      .select('id, photo:photos!inner(album:albums!inner(owner_id))', { count: 'exact', head: true })
      .eq('photo.album.owner_id', me)
      .neq('user_id', me)
      .gt('created_at', commentsSeen),
  ]);
  return { newPhotos: photos.count ?? 0, newComments: comments.count ?? 0 };
}