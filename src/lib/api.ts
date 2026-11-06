import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

import { downloadToLocal } from './local-copy';

import type { SourcePhoto } from './media-types';
import { BUCKET, supabase } from './supabase';
import type { Album, AlbumWithCount, Comment, Photo, Profiles } from './types';

const MAX_DIMENSION = 1080;
/** Short edge of a thumbnail: sharp in a 3-column grid on a phone, a fraction of the full photo's size. */
const THUMB_DIMENSION = 480;
/** How long to remember that a thumbnail doesn't exist before checking again. */
const MISSING_THUMB_MS = 10 * 60 * 1000;
const BACKFILL_CONCURRENCY = 2;
/** Max ids per `.in()` filter, so request URLs stay well under proxy limits. */
const IN_CHUNK = 100;
const UPLOAD_CONCURRENCY = 3;

/** Where a photo's thumbnail lives. Fixed by convention, so no database change is needed. */
export const thumbPathOf = (path: string) => path.replace(/\.jpg$/, '.thumb.jpg');

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Reads every row. The server returns at most 1000 per request, so longer lists would be cut off silently. */
async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < size) return rows;
  }
}

// ---------------------------------------------------------------------------
// Signed URL cache
//
// Every fetch used to re-sign every photo, producing a brand-new URL each time.
// Browsers cache by URL, so the web app re-downloaded every image on each refetch,
// and URLs restored from the persisted query cache were dead after an hour.
// Now a signed URL is reused until it is close to expiring, and the map is persisted.
// ---------------------------------------------------------------------------

const SIGN_SECONDS = 24 * 60 * 60;
/** Re-sign when less than this much lifetime is left. */
const RESIGN_BEFORE_MS = 3 * 60 * 60 * 1000;
const URL_CACHE_KEY = 'jg.signed-urls';

type SignedEntry = { url: string; exp: number };
let urlCache: Map<string, SignedEntry> | null = null;
let urlCacheLoad: Promise<Map<string, SignedEntry>> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadUrlCache(): Promise<Map<string, SignedEntry>> {
  if (urlCache) return Promise.resolve(urlCache);
  urlCacheLoad ??= (async () => {
    const map = new Map<string, SignedEntry>();
    try {
      const raw = await AsyncStorage.getItem(URL_CACHE_KEY);
      const now = Date.now();
      if (raw) {
        for (const [path, entry] of Object.entries(JSON.parse(raw) as Record<string, SignedEntry>)) {
          if (entry.exp > now) map.set(path, entry);
        }
      }
    } catch {
      // Corrupt or unavailable storage: start empty.
    }
    urlCache = map;
    return map;
  })();
  return urlCacheLoad;
}

function persistUrlCache() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!urlCache) return;
    const now = Date.now();
    const out: Record<string, SignedEntry> = {};
    for (const [path, entry] of urlCache) {
      if (entry.exp > now) out[path] = entry;
      else urlCache.delete(path);
    }
    AsyncStorage.setItem(URL_CACHE_KEY, JSON.stringify(out)).catch(() => {});
  }, 1000);
}

/** Forget cached URLs (e.g. on sign-out). */
export async function clearSignedUrlCache(): Promise<void> {
  urlCache = new Map();
  urlCacheLoad = null;
  await AsyncStorage.removeItem(URL_CACHE_KEY).catch(() => {});
}

async function signUrls(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return {};
  const cache = await loadUrlCache();
  const freshUntil = Date.now() + RESIGN_BEFORE_MS;

  const out: Record<string, string> = {};
  const missing: string[] = [];
  const now = Date.now();
  for (const path of unique) {
    const hit = cache.get(path);
    if (hit && hit.url === '' && hit.exp > now) continue; // Recently found not to exist.
    if (hit && hit.exp > freshUntil) out[path] = hit.url;
    else missing.push(path);
  }
  if (missing.length === 0) return out;

  const exp = Date.now() + SIGN_SECONDS * 1000;
  const results = await Promise.all(
    chunk(missing, 500).map((part) => supabase.storage.from(BUCKET).createSignedUrls(part, SIGN_SECONDS)),
  );
  for (const { data, error } of results) {
    if (error) throw error;
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        out[item.path] = item.signedUrl;
        cache.set(item.path, { url: item.signedUrl, exp });
      } else if (item.path) {
        cache.set(item.path, { url: '', exp: now + MISSING_THUMB_MS });
      }
    }
  }
  persistUrlCache();
  return out;
}

type RawAlbum = Omit<Album, 'coverUrl' | 'coverKey'>;

const coverPaths = (coverPath: string | null) => (coverPath ? [coverPath, thumbPathOf(coverPath)] : []);

function toAlbum(raw: RawAlbum, urls: Record<string, string>): Album {
  if (!raw.cover_path) return { ...raw, coverUrl: null, coverKey: null };
  const thumb = thumbPathOf(raw.cover_path);
  return urls[thumb]
    ? { ...raw, coverUrl: urls[thumb], coverKey: thumb }
    : { ...raw, coverUrl: urls[raw.cover_path] ?? null, coverKey: raw.cover_path };
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
  created_at: string;
  album: RawAlbum;
  comments: { count: number }[];
  favorites: { user_id: string }[];
};

/**
 * Photo columns plus comment count and favorite flag, computed by the database in the same request
 * (previously two extra queries that downloaded one row per comment just to count them).
 * Favorites RLS only returns the caller's own rows.
 */
const PHOTO_SELECT =
  'id, album_id, path, width, height, taken_at, created_at, album:albums!inner(id, owner_id, name, cover_path, source_album_id), comments(count), favorites(user_id)';

async function fetchLikes(ids: string[]) {
  const results = await Promise.all(
    chunk(ids, IN_CHUNK).map((part) => supabase.from('likes').select('photo_id, user_id, count').in('photo_id', part)),
  );
  const likes: Record<string, Record<string, number>> = {};
  for (const res of results) {
    if (res.error) throw res.error;
    for (const l of res.data ?? []) (likes[l.photo_id] ??= {})[l.user_id] = l.count;
  }
  return likes;
}

async function enrichPhotos(rows: RawPhoto[], me: string): Promise<Photo[]> {
  if (rows.length === 0) return [];
  const [urls, likes] = await Promise.all([
    signUrls(rows.flatMap((r) => [r.path, thumbPathOf(r.path), ...coverPaths(r.album.cover_path)])),
    fetchLikes(rows.map((r) => r.id)),
  ]);

  return rows.map((r) => {
    const byUser = likes[r.id] ?? {};
    const thumb = thumbPathOf(r.path);
    return {
      id: r.id,
      album_id: r.album_id,
      path: r.path,
      url: urls[r.path] ?? '',
      thumbUrl: urls[thumb] ?? null,
      thumbKey: urls[thumb] ? thumb : r.path,
      width: r.width,
      height: r.height,
      taken_at: r.taken_at,
      created_at: r.created_at,
      album: toAlbum(r.album, urls),
      likesByUser: byUser,
      myLikes: byUser[me] ?? 0,
      likeTotal: Object.values(byUser).reduce((a, b) => a + b, 0),
      commentCount: r.comments?.[0]?.count ?? 0,
      favorited: (r.favorites ?? []).some((f) => f.user_id === me),
    };
  });
}

/** Feed: the newest 500 photos from albums owned by anyone except `me` (the screen shuffles them). */
export async function fetchFeedAll(me: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select(PHOTO_SELECT)
    .neq('album.owner_id', me)
    .order('created_at', { ascending: false })
    .range(0, 499)
    .overrideTypes<RawPhoto[]>();
  if (error) throw error;
  return enrichPhotos(data ?? [], me);
}

export async function fetchAlbumPhotos(albumId: string, me: string): Promise<Photo[]> {
  const rows = await fetchAllRows<RawPhoto>((from, to) =>
    supabase
      .from('photos')
      .select(PHOTO_SELECT)
      .eq('album_id', albumId)
      .order('taken_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
      .overrideTypes<RawPhoto[]>(),
  );
  return enrichPhotos(rows, me);
}

export async function fetchPhoto(photoId: string, me: string): Promise<Photo | null> {
  const { data, error } = await supabase
    .from('photos')
    .select(PHOTO_SELECT)
    .eq('id', photoId)
    .maybeSingle()
    .overrideTypes<RawPhoto>();
  if (error) throw error;
  if (!data) return null;
  return (await enrichPhotos([data], me))[0];
}

const ALBUM_SELECT = 'id, owner_id, name, cover_path, source_album_id, photos(count)';

type RawAlbumWithCount = RawAlbum & { photos: { count: number }[] };

async function withUrls(rows: RawAlbumWithCount[]): Promise<AlbumWithCount[]> {
  const urls = await signUrls(rows.flatMap((r) => coverPaths(r.cover_path)));
  return rows.map(({ photos, ...r }) => ({ ...toAlbum(r, urls), photoCount: photos?.[0]?.count ?? 0 }));
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

export type AlbumComment = Comment & { photoUrl: string; photoKey: string };

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
  const urls = await signUrls(rows.flatMap((r) => [r.photo.path, thumbPathOf(r.photo.path)]));
  return rows.map(({ photo, ...c }) => {
    const thumb = thumbPathOf(photo.path);
    return urls[thumb]
      ? { ...c, photoUrl: urls[thumb], photoKey: thumb }
      : { ...c, photoUrl: urls[photo.path] ?? '', photoKey: photo.path };
  });
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
  return { ...data, coverUrl: null, coverKey: null };
}

export async function deleteAlbum(albumId: string, me: string): Promise<void> {
  const files = await fetchAllRows<{ path: string }>((from, to) =>
    supabase.from('photos').select('path').eq('album_id', albumId).order('id').range(from, to),
  );
  const paths = files.flatMap((f) => [f.path, thumbPathOf(f.path)]);
  for (const part of chunk(paths, 1000)) await supabase.storage.from(BUCKET).remove(part);
  const { error } = await supabase.from('albums').delete().eq('id', albumId).eq('owner_id', me);
  if (error) throw error;
}

/**
 * Removes photos from the app only, in a handful of requests regardless of how many are selected.
 * Their source keys are remembered so Sync doesn't bring them back, and a deleted cover is replaced.
 */
export async function deletePhotos(photos: Pick<Photo, 'id' | 'path' | 'album_id'>[]): Promise<void> {
  if (photos.length === 0) return;
  const ids = photos.map((p) => p.id);
  const deletedPaths = new Set(photos.map((p) => p.path));

  const sourceById = new Map<string, string | null>();
  for (const part of chunk(ids, IN_CHUNK)) {
    const { data } = await supabase.from('photos').select('id, source_asset_id').in('id', part);
    for (const r of data ?? []) sourceById.set(r.id, r.source_asset_id);
  }
  for (const part of chunk(ids, IN_CHUNK)) {
    const { error } = await supabase.from('photos').delete().in('id', part);
    if (error) throw error;
  }
  const files = [...deletedPaths].flatMap((p) => [p, thumbPathOf(p)]);
  for (const part of chunk(files, 1000)) await supabase.storage.from(BUCKET).remove(part);

  const byAlbum = new Map<string, string[]>();
  for (const p of photos) {
    const src = sourceById.get(p.id);
    const list = byAlbum.get(p.album_id) ?? [];
    if (src) list.push(src);
    byAlbum.set(p.album_id, list);
  }

  await Promise.all(
    [...byAlbum].map(async ([albumId, removedNow]) => {
      const { data: album } = await supabase
        .from('albums')
        .select('removed_source_ids, cover_path')
        .eq('id', albumId)
        .maybeSingle();
      if (!album) return;
      const update: { removed_source_ids?: string[]; cover_path?: string | null } = {};

      const removed: string[] = album.removed_source_ids ?? [];
      const merged = [...new Set([...removed, ...removedNow])];
      if (merged.length !== removed.length) update.removed_source_ids = merged;

      if (album.cover_path && deletedPaths.has(album.cover_path)) {
        const { data: next } = await supabase
          .from('photos')
          .select('path')
          .eq('album_id', albumId)
          .order('created_at', { ascending: true })
          .limit(1);
        update.cover_path = next?.[0]?.path ?? null;
      }

      if (Object.keys(update).length) await supabase.from('albums').update(update).eq('id', albumId);
    }),
  );
}

export async function deletePhoto(photo: Pick<Photo, 'id' | 'path' | 'album_id'>): Promise<void> {
  return deletePhotos([photo]);
}

export async function setAlbumCover(albumId: string, path: string): Promise<void> {
  const { error } = await supabase.from('albums').update({ cover_path: path }).eq('id', albumId);
  if (error) throw error;
}

function imageSize(uri: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) =>
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject),
  );
}

async function processForUpload(uri: string) {
  // Size first, so the image renders only once. On web each render also encodes a PNG, which is
  // very slow at full camera resolution.
  const { width, height } = await imageSize(uri);
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_DIMENSION) {
    context.resize(width >= height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION });
  }
  const image = await context.renderAsync();
  try {
    return await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  } finally {
    // Free the decoded pixels now: several uploads run at once and phones run out of memory quickly.
    context.release();
    image.release();
  }
}

/** A small JPEG made from a local image, ready to upload. */
async function makeThumbnail(uri: string, width: number, height: number): Promise<ArrayBuffer> {
  const context = ImageManipulator.manipulate(uri);
  if (Math.min(width, height) > THUMB_DIMENSION) {
    context.resize(width <= height ? { width: THUMB_DIMENSION } : { height: THUMB_DIMENSION });
  }
  const image = await context.renderAsync();
  try {
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    const body = await (await fetch(saved.uri)).arrayBuffer();
    if (saved.uri.startsWith('blob:')) URL.revokeObjectURL(saved.uri);
    return body;
  } finally {
    context.release();
    image.release();
  }
}

function randomName() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
}

export type SyncProgress = { done: number; total: number };

export type SyncResult = { uploaded: number; failed: number };

/** Uploads photos not yet in the album (deduped by source key), a few at a time. */
export async function syncAlbum(
  album: Pick<Album, 'id' | 'owner_id' | 'cover_path'>,
  sources: SourcePhoto[],
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const [existing, albumRes] = await Promise.all([
    fetchAllRows<{ source_asset_id: string }>((from, to) =>
      supabase.from('photos').select('source_asset_id').eq('album_id', album.id).order('id').range(from, to),
    ),
    supabase.from('albums').select('removed_source_ids').eq('id', album.id).maybeSingle(),
  ]);
  const known = new Set<string>([
    ...existing.map((r) => r.source_asset_id),
    ...((albumRes.data?.removed_source_ids as string[] | undefined) ?? []),
  ]);
  const todo = sources.filter((s) => !known.has(s.key));

  let coverSet = !!album.cover_path;
  let done = 0;
  let uploaded = 0;
  let failed = 0;
  onProgress?.({ done, total: todo.length });

  const uploadOne = async (source: SourcePhoto) => {
    const localUri = await source.getUri();
    const processed = await processForUpload(localUri);
    const body = await (await fetch(processed.uri)).arrayBuffer();
    const thumbBody = await makeThumbnail(processed.uri, processed.width, processed.height).catch(() => null);
    if (processed.uri.startsWith('blob:')) URL.revokeObjectURL(processed.uri);
    const path = `${album.owner_id}/${album.id}/${randomName()}`;
    const upload = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' });
    if (upload.error) throw upload.error;
    // Optional: without one the app shows the full photo, and the backfill can add it later.
    if (thumbBody) await supabase.storage.from(BUCKET).upload(thumbPathOf(path), thumbBody, { contentType: 'image/jpeg' });
    const insert = await supabase.from('photos').insert({
      album_id: album.id,
      path,
      width: processed.width,
      height: processed.height,
      taken_at: source.takenAt,
      source_asset_id: source.key,
    });
    if (insert.error) {
      await supabase.storage.from(BUCKET).remove([path, thumbPathOf(path)]);
      throw insert.error;
    }
    uploaded += 1;
    if (!coverSet) {
      coverSet = true;
      await supabase.from('albums').update({ cover_path: path }).eq('id', album.id);
    }
  };

  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const source = todo[next++];
      try {
        await uploadOne(source);
      } catch (e) {
        failed += 1;
        console.warn('Skipping photo that failed to upload', source.key, e);
      }
      done += 1;
      onProgress?.({ done, total: todo.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, todo.length) }, worker));
  return { uploaded, failed };
}

/**
 * Creates thumbnails for photos uploaded before thumbnails existed. Runs in the background on the
 * owner's device (only the owner may write to their folder) until every photo has one, then never again.
 */
export async function backfillThumbnails(me: string): Promise<void> {
  const doneKey = `jg.thumbs-done.${me}`;
  if (await AsyncStorage.getItem(doneKey)) return;

  const rows = await fetchAllRows<{ path: string }>((from, to) =>
    supabase
      .from('photos')
      .select('path, album:albums!inner(owner_id)')
      .eq('album.owner_id', me)
      .order('id')
      .range(from, to),
  );
  const existing = await signUrls(rows.map((r) => thumbPathOf(r.path)));
  const todo = rows.filter((r) => !existing[thumbPathOf(r.path)]);
  const fullUrls = await signUrls(todo.map((r) => r.path));

  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const { path } = todo[next++];
      const thumb = thumbPathOf(path);
      try {
        const local = await downloadToLocal(fullUrls[path], `thumb-source-${next}.jpg`);
        try {
          const { width, height } = await imageSize(local.uri);
          const body = await makeThumbnail(local.uri, width, height);
          const { error } = await supabase.storage.from(BUCKET).upload(thumb, body, { contentType: 'image/jpeg' });
          // Already there is fine: another device got to it first.
          if (error && !/exists|duplicate/i.test(error.message)) throw error;
        } finally {
          local.release();
        }
        urlCache?.delete(thumb);
      } catch (e) {
        failed += 1;
        console.warn('Could not create thumbnail', path, e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BACKFILL_CONCURRENCY, todo.length) }, worker));
  if (failed === 0) await AsyncStorage.setItem(doneKey, '1');
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
