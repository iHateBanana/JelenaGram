import { MaterialIcons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { Avatar } from '@/components/avatar';
import { useHearts } from '@/components/hearts';
import { addLike, deletePhoto, setFavorite } from '@/lib/api';
import { savePhoto } from '@/lib/save-photo';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { colors, themed, useTheme } from '@/lib/theme';
import type { Photo } from '@/lib/types';

export const POST_HEADER = 56;
export const POST_FOOTER = 92;
const FALLBACK_RATIO = 1.25;
const MAX_RATIO = 1.5;
const CARD_MARGIN = 12;
const CARD_GAP = 14;

/** Frame height/width ratio: matches the photo, capped so very tall photos don't take over the screen. */
const frameRatio = (photo: Pick<Photo, 'width' | 'height'>) =>
  photo.width && photo.height ? Math.min(photo.height / photo.width, MAX_RATIO) : FALLBACK_RATIO;

export const postHeight = (width: number, photo: Pick<Photo, 'width' | 'height'>) =>
  CARD_GAP + POST_HEADER + (width - CARD_MARGIN * 2 - 2) * frameRatio(photo) + POST_FOOTER + 2;

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

export function Post({ photo, width }: { photo: Photo; width: number }) {
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
      for (const key of ['feed', 'albumPhotos', 'album', 'myAlbums', 'albumComments']) {
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
    try {
      await setFavorite(photo.id, me!, next);
      qc.invalidateQueries({ queryKey: ['favorites'] });
    } catch {
      setFav(!next);
    }
  };

  const download = async () => {
    try {
      const res = await savePhoto(photo.url, `jelenagram-${photo.id.slice(0, 8)}`);
      if (res === 'denied') Alert.alert('Permission needed', 'Allow photo access in Settings to save pictures.');
      else if (Platform.OS !== 'web') Alert.alert('Saved', 'The photo is in your Photos library.');
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.');
    }
  };

  const onLike = async () => {
    likeRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => hearts.burst(x + w / 2, y + h / 2));
    setMine((n) => n + 1);
    inflight.current += 1;
    try {
      await addLike(photo.id);
    } catch {
      setMine((n) => Math.max(0, n - 1));
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

  const innerWidth = width - CARD_MARGIN * 2 - 2;

  return (
    <View style={{ width, height: postHeight(width, photo), paddingHorizontal: CARD_MARGIN, paddingTop: CARD_GAP }}>
      <View style={styles.card}>
      <View style={styles.header}>
        <Pressable style={styles.albumLink} onPress={openAlbum} accessibilityRole="button">
          <Avatar uri={photo.album.coverUrl} name={photo.album.name} size={36} />
          <Text style={styles.albumName} numberOfLines={1}>
            {photo.album.name}
          </Text>
          <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
        </Pressable>
        {isOwner && (
          <Pressable onPress={() => remove.mutate()} hitSlop={8} accessibilityLabel="Remove photo">
            <MaterialIcons name="delete-outline" size={22} color={colors.muted} />
          </Pressable>
        )}
      </View>
      <View style={{ width: innerWidth, height: innerWidth * frameRatio(photo), backgroundColor: colors.placeholder }}>
        <Image source={{ uri: photo.url, cacheKey: photo.path }} cachePolicy="memory-disk" style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />
        <Image source={{ uri: photo.url, cacheKey: photo.path }} cachePolicy="memory-disk" style={StyleSheet.absoluteFill} contentFit="contain" transition={150} />
      </View>
      <View style={styles.footer}>
        <View style={styles.actions}>
          <Pressable
            ref={likeRef}
            onPress={onLike}
            hitSlop={8}
            accessibilityLabel="Like"
            style={[styles.pill, mine > 0 && styles.pillActive]}
          >
            <MaterialIcons
              name={mine > 0 ? 'favorite' : 'favorite-border'}
              size={22}
              color={mine > 0 ? colors.like : colors.text}
            />
          </Pressable>
          <Pressable onPress={openComments} hitSlop={8} accessibilityLabel="Comments" style={styles.pill}>
            <MaterialIcons name="chat-bubble-outline" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={toggleFav} hitSlop={8} accessibilityLabel={fav ? 'Remove from saved' : 'Save to favorites'} style={styles.iconBtn}>
            <MaterialIcons name={fav ? 'bookmark' : 'bookmark-border'} size={24} color={fav ? colors.like : colors.text} />
          </Pressable>
          <Pressable onPress={download} hitSlop={8} accessibilityLabel="Save photo" style={styles.iconBtn}>
            <MaterialIcons name="file-download" size={24} color={colors.text} />
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
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    overflow: 'hidden',
  },
  chevron: { marginLeft: 'auto' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  pillActive: { borderColor: colors.like, backgroundColor: colors.likeTint },
  albumLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  header: {
    height: POST_HEADER,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  albumName: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  footer: { height: POST_FOOTER, paddingHorizontal: 12, paddingTop: 6 },
  actions: { flexDirection: 'row', gap: 10, height: 40, alignItems: 'center' },
  iconBtn: { height: 34, width: 34, alignItems: 'center', justifyContent: 'center' },
  likes: { fontSize: 14, fontWeight: '600', color: colors.text, height: 22 },
  commentLink: { fontSize: 14, color: colors.muted, height: 22 },
}));
