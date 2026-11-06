import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { Avatar } from '@/components/avatar';
import { useHearts } from '@/components/hearts';
import { useViewer } from '@/components/photo-viewer';
import { addLike, deletePhoto, setFavorite } from '@/lib/api';
import { savePhoto } from '@/lib/save-photo';
import { useAuth } from '@/lib/auth';
import { confirm, notify } from '@/lib/confirm';
import { monthYear } from '@/lib/dates';
import { patchPhoto } from '@/lib/photo-cache';
import { colors, themed, useTheme } from '@/lib/theme';
import type { Photo } from '@/lib/types';

export const POST_HEADER = 56;
export const POST_FOOTER = 96;
const FALLBACK_RATIO = 1.25;
const MAX_RATIO = 1.5;
const POST_GAP = 8;
const DOUBLE_TAP_MS = 280;

/** Frame height/width ratio: matches the photo, capped so very tall photos don't take over the screen. */
const frameRatio = (photo: Pick<Photo, 'width' | 'height'>) =>
  photo.width && photo.height ? Math.min(photo.height / photo.width, MAX_RATIO) : FALLBACK_RATIO;

export const postHeight = (width: number, photo: Pick<Photo, 'width' | 'height'>) =>
  POST_GAP + POST_HEADER + width * frameRatio(photo) + POST_FOOTER;

/** Cumulative layout for FlatList.getItemLayout with variable-height posts. */
export function postLayout(photos: Photo[], width: number) {
  const offsets: number[] = [];
  let y = 0;
  for (const p of photos) {
    offsets.push(y);
    y += postHeight(width, p);
  }
  return (_: unknown, index: number) => ({
    length: postHeight(width, photos[index]),
    offset: offsets[index],
    index,
  });
}

/**
 * Stable FlatList props for a list of posts. Posts are tall and image-heavy, so only a few screens'
 * worth stay mounted (the default keeps ~10 screens above and below alive).
 */
export function usePostList(photos: Photo[], width: number) {
  const viewer = useViewer();
  const latest = useRef(photos);
  latest.current = photos;
  const openPhoto = useCallback(
    (photoId: string) => viewer.open(latest.current, latest.current.findIndex((p) => p.id === photoId)),
    [viewer],
  );
  const getItemLayout = useMemo(() => postLayout(photos, width), [photos, width]);
  const renderItem = useCallback(
    ({ item }: { item: Photo }) => <Post photo={item} width={width} onOpen={openPhoto} />,
    [width, openPhoto],
  );
  return {
    data: photos,
    keyExtractor: postKey,
    renderItem,
    getItemLayout,
    windowSize: 5,
    initialNumToRender: 2,
    maxToRenderPerBatch: 3,
    removeClippedSubviews: Platform.OS !== 'web',
  };
}

const postKey = (p: Photo) => p.id;

/**
 * The blurred backdrop only shows when the photo doesn't fill its frame (very tall photos, or unknown size).
 * Blurring is expensive, so it's skipped for everything else.
 */
const needsBackdrop = (photo: Pick<Photo, 'width' | 'height'>) =>
  !photo.width || !photo.height || photo.height / photo.width > MAX_RATIO;

/** Memoized: the feed re-renders often (refetches, activity polling) but each photo rarely changes. */
export const Post = memo(function Post({ photo, width, onOpen }: { photo: Photo; width: number; onOpen: (photoId: string) => void }) {
  useTheme();
  const router = useRouter();
  const hearts = useHearts();
  const likeRef = useRef<React.ElementRef<typeof Pressable>>(null);
  const qc = useQueryClient();
  const { nameOf, me } = useAuth();
  const [mine, setMine] = useState(photo.myLikes);
  const inflight = useRef(0);
  const isOwner = photo.album.owner_id === me;

  const remove = useMutation({
    mutationFn: async () => {
      if (!(await confirm('Remove this photo?', 'It will be deleted from JelenaGram. Your phone is untouched.', 'Remove'))) return;
      await deletePhoto(photo);
    },
    onSettled: () => {
      for (const key of ['feed', 'albumPhotos', 'album', 'myAlbums', 'albumComments', 'favorites']) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });

  useEffect(() => {
    if (inflight.current === 0) setMine(photo.myLikes);
  }, [photo.myLikes]);

  const others = photo.likeTotal - photo.myLikes;
  const total = others + mine;

  const [fav, setFav] = useState(photo.favorited);
  useEffect(() => setFav(photo.favorited), [photo.favorited]);

  const toggleFav = async () => {
    const next = !fav;
    setFav(next);
    // Written to the cache too: posts unmount when scrolled away, and would come back with old values.
    patchPhoto(qc, photo.id, (p) => ({ ...p, favorited: next }));
    try {
      await setFavorite(photo.id, me!, next);
      qc.invalidateQueries({ queryKey: ['favorites'] });
    } catch {
      setFav(!next);
      patchPhoto(qc, photo.id, (p) => ({ ...p, favorited: !next }));
    }
  };

  const download = async () => {
    try {
      const res = await savePhoto(photo.url, `jelenagram-${photo.id.slice(0, 8)}`);
      if (res === 'denied') notify('Permission needed', 'Allow photo access in Settings to save pictures.');
      else if (Platform.OS !== 'web') notify('Saved', 'The photo is in your Photos library.');
    } catch (e) {
      notify('Could not save', e instanceof Error ? e.message : 'Try again.');
    }
  };

  // One tap opens the photo, two like it, so a single tap has to wait briefly to see if a second follows.
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
  }, []);
  const onPhotoPress = (e: { nativeEvent: { pageX?: number; pageY?: number } }) => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      void onLike({ x: e.nativeEvent.pageX ?? 0, y: e.nativeEvent.pageY ?? 0 });
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      onOpen(photo.id);
    }, DOUBLE_TAP_MS);
  };

  const changeMyLikes = (delta: number) =>
    patchPhoto(qc, photo.id, (p) => {
      const own = Math.max(0, p.myLikes + delta);
      return {
        ...p,
        myLikes: own,
        likeTotal: p.likeTotal - p.myLikes + own,
        likesByUser: { ...p.likesByUser, [me!]: own },
      };
    });

  const onLike = async (at?: { x: number; y: number }) => {
    if (at) hearts.burst(at.x, at.y);
    else likeRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => hearts.burst(x + w / 2, y + h / 2));
    setMine((n) => n + 1);
    inflight.current += 1;
    changeMyLikes(1);
    try {
      await addLike(photo.id);
    } catch {
      setMine((n) => Math.max(0, n - 1));
      changeMyLikes(-1);
    } finally {
      inflight.current -= 1;
    }
  };

  const perPerson = Object.entries({ ...photo.likesByUser, ...(me ? { [me]: mine } : {}) })
    .filter(([, count]) => count > 0)
    .map(([id, count]) => `${nameOf(id)} ${count}`)
    .join(' · ');

  const openAlbum = () => router.push({ pathname: '/album/[id]', params: { id: photo.album.id } });
  const openComments = () => router.push({ pathname: '/photo/[id]/comments', params: { id: photo.id } });

  return (
    <View style={{ width, height: postHeight(width, photo), paddingTop: POST_GAP }}>
      <View style={styles.header}>
        <Pressable style={styles.albumLink} onPress={openAlbum} accessibilityRole="button">
          <Avatar uri={photo.album.coverUrl} cacheKey={photo.album.coverKey} name={photo.album.name} size={36} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.albumName} numberOfLines={1}>
              {photo.album.name}
            </Text>
            <Text style={styles.date} numberOfLines={1}>
              {monthYear(photo.taken_at)}
            </Text>
          </View>
        </Pressable>
        {isOwner && (
          <Pressable onPress={() => remove.mutate()} accessibilityLabel="Remove photo" style={styles.iconBtn}>
            <MaterialIcons name="delete-outline" size={22} color={colors.muted} />
          </Pressable>
        )}
      </View>
      <Pressable
        onPress={onPhotoPress}
        accessibilityLabel="Open photo. Double tap to like"
        style={{ width, height: width * frameRatio(photo), backgroundColor: colors.placeholder }}>
        {needsBackdrop(photo) && (
          <Image source={{ uri: photo.thumbUrl ?? photo.url, cacheKey: photo.thumbKey }} cachePolicy="memory-disk" style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} recyclingKey={`${photo.id}-bg`} />
        )}
        <Image
          source={{ uri: photo.url, cacheKey: photo.path }}
          placeholder={photo.thumbUrl ? { uri: photo.thumbUrl, cacheKey: photo.thumbKey } : undefined}
          placeholderContentFit="contain"
          cachePolicy="memory-disk"
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={150}
          recyclingKey={photo.id}
        />
      </Pressable>
      <View style={styles.footer}>
        <View style={styles.actions}>
          <Pressable ref={likeRef} onPress={() => onLike()} accessibilityLabel="Like" style={styles.iconBtn}>
            <MaterialIcons name={mine > 0 ? 'favorite' : 'favorite-border'} size={27} color={mine > 0 ? colors.like : colors.text} />
          </Pressable>
          <Pressable onPress={openComments} accessibilityLabel="Comments" style={styles.iconBtn}>
            <MaterialIcons name="chat-bubble-outline" size={25} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={toggleFav} accessibilityLabel={fav ? 'Remove from saved' : 'Save to favorites'} style={styles.iconBtn}>
            <MaterialIcons name={fav ? 'bookmark' : 'bookmark-border'} size={26} color={colors.text} />
          </Pressable>
          <Pressable onPress={download} accessibilityLabel="Save photo" style={styles.iconBtn}>
            <MaterialIcons name="file-download" size={25} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.likes} numberOfLines={1}>
          {total === 0 ? 'No likes yet' : `${total} like${total === 1 ? '' : 's'}`}
          {perPerson && total > 0 ? `  (${perPerson})` : ''}
        </Text>
        <Pressable onPress={openComments}>
          <Text style={styles.commentLink} numberOfLines={1}>
            {photo.commentCount === 0
              ? 'Add a comment…'
              : `View ${photo.commentCount} comment${photo.commentCount === 1 ? '' : 's'}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = themed(() => StyleSheet.create({
  albumLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  header: {
    height: POST_HEADER,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  albumName: { fontSize: 15, lineHeight: 19, fontWeight: '600', color: colors.text },
  date: { fontSize: 12, lineHeight: 16, color: colors.muted },
  footer: { height: POST_FOOTER, paddingHorizontal: 12, paddingTop: 4 },
  actions: { flexDirection: 'row', height: 44, alignItems: 'center', marginHorizontal: -8 },
  iconBtn: { height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  likes: { fontSize: 14, lineHeight: 22, fontWeight: '600', color: colors.text, height: 22 },
  commentLink: { fontSize: 14, lineHeight: 22, color: colors.muted, height: 22 },
}));
