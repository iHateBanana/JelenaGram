import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { useViewer } from '@/components/photo-viewer';
import { usePostList } from '@/components/post';
import { FeedSkeleton, Message, useContentWidth } from '@/components/states';
import { getSeen, markSeen } from '@/lib/activity';
import { fetchFeedAll } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isOnThisDay } from '@/lib/dates';
import { colors, MAX_CONTENT_WIDTH, themed, useTheme } from '@/lib/theme';
import type { Photo } from '@/lib/types';
import { useActivity } from '@/lib/use-activity';

/** FNV-1a hash of an id, mixed with the session's seed. */
function rank(id: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return (h ^ (h >>> 13)) >>> 0;
}

/**
 * Random order that stays put when the data changes: each photo's position depends only on its own
 * id, so a new or deleted photo doesn't reshuffle the feed while someone is scrolling it.
 */
function seededShuffle<T extends { id: string }>(items: T[], seed: number): T[] {
  return items
    .map((item) => ({ item, r: rank(item.id, seed) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.item);
}

/** Photos added since `seenAt` come first, newest at the top; everything else is shuffled below them. */
function feedOrder(photos: Photo[], seenAt: string, seed: number): Photo[] {
  const cutoff = Date.parse(seenAt);
  const fresh = photos.filter((p) => Date.parse(p.created_at) > cutoff);
  fresh.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const rest = photos.filter((p) => !(Date.parse(p.created_at) > cutoff));
  return [...fresh, ...seededShuffle(rest, seed)];
}

export default function Home() {
  useTheme();
  const { me, otherName } = useAuth();
  const qc = useQueryClient();
  const viewer = useViewer();
  const activity = useActivity();
  const newPhotos = activity.data?.newPhotos ?? 0;

  const router = useRouter();
  const width = useContentWidth();
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const listRef = useRef<FlatList<Photo>>(null);

  // Read once: new photos stay at the top for this visit, even after the banner is tapped.
  const [seenAt, setSeenAt] = useState<string | null>(null);
  useEffect(() => {
    if (me) getSeen('feed', me).then(setSeenAt);
  }, [me]);

  const query = useQuery({
    queryKey: ['feed', me],
    enabled: !!me,
    queryFn: () => fetchFeedAll(me!),
  });

  const photos = useMemo(
    () => (seenAt ? feedOrder(query.data ?? [], seenAt, seed) : []),
    [query.data, seenAt, seed],
  );
  const memories = useMemo(() => photos.filter((p) => isOnThisDay(p.taken_at)), [photos]);
  const list = usePostList(photos, width);

  const showNewPhotos = async () => {
    if (!me) return;
    await markSeen('feed', me);
    qc.invalidateQueries({ queryKey: ['activity'] });
    await query.refetch();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  if (query.isPending || !seenAt) return <FeedSkeleton />;
  if (query.isError) {
    return <Message title="Couldn't load the feed" body={query.error.message} action="Retry" onAction={() => query.refetch()} />;
  }

  if (photos.length === 0) {
    return (
      <Message
        title={`Waiting for ${otherName} to share an album`}
        body="Their photos will show up here. You can share your own albums from My albums."
        action="My albums"
        onAction={() => router.push('/my-albums')}
      />
    );
  }

  const memoryYear = memories.length ? new Date(memories[0].taken_at).getFullYear() : null;

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      {newPhotos > 0 && (
        <Pressable style={styles.banner} onPress={showNewPhotos} accessibilityRole="button">
          <MaterialIcons name="arrow-upward" size={18} color={colors.text} />
          <Text style={styles.bannerText}>
            {newPhotos} new photo{newPhotos === 1 ? '' : 's'}. Tap to see {newPhotos === 1 ? 'it' : 'them'}.
          </Text>
        </Pressable>
      )}
      {memories.length > 0 && (
        <Pressable style={styles.memory} onPress={() => viewer.open(memories, 0)} accessibilityRole="button">
          <MaterialIcons name="auto-awesome" size={18} color={colors.like} />
          <Text style={styles.memoryText} numberOfLines={1}>
            On this day: {memories.length} photo{memories.length === 1 ? '' : 's'} from {memoryYear}
          </Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
        </Pressable>
      )}
      <FlatList
        ref={listRef}
        style={{ width }}
        {...list}
        refreshing={query.isRefetching}
        onRefresh={() => {
          query.refetch();
          activity.refetch();
        }}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  banner: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    backgroundColor: colors.likeTint,
  },
  bannerText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  memory: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  memoryText: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 14 },
}));
