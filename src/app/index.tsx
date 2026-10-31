import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionBar } from '@/components/action-bar';
import { Post, postLayout } from '@/components/post';
import { Loading, Message, useContentWidth } from '@/components/states';
import { fetchFeedAll } from '@/lib/api';
import { markSeen } from '@/lib/activity';
import { useAuth } from '@/lib/auth';
import { colors, themed, useTheme } from '@/lib/theme';
import { useActivity } from '@/lib/use-activity';

function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function Home() {
  useTheme();
  const { me, otherName } = useAuth();
  const qc = useQueryClient();
  const activity = useActivity();
  const newPhotos = activity.data?.newPhotos ?? 0;
  const newComments = activity.data?.newComments ?? 0;

  const dismissBanner = async () => {
    if (!me) return;
    await markSeen('feed', me);
    qc.invalidateQueries({ queryKey: ['activity'] });
  };

  const router = useRouter();
  const width = useContentWidth();
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));

  const query = useQuery({
    queryKey: ['feed', me],
    enabled: !!me,
    queryFn: () => fetchFeedAll(me!),
  });

  const photos = useMemo(() => seededShuffle(query.data ?? [], seed), [query.data, seed]);

  if (query.isPending) return <Loading />;
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

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <ActionBar
        actions={[
          { label: 'My albums', onPress: () => router.push('/my-albums'), dot: newComments > 0 },
          { label: 'Saved', onPress: () => router.push('/saved'), secondary: true },
          { label: 'Settings', onPress: () => router.push('/settings'), secondary: true },
        ]}
      />
      {newPhotos > 0 && (
        <Pressable style={styles.banner} onPress={dismissBanner} accessibilityRole="button">
          <Text style={styles.bannerText}>
            {newPhotos} new photo{newPhotos === 1 ? '' : 's'}
            {newComments > 0 ? `  ·  ${newComments} new comment${newComments === 1 ? '' : 's'}` : ''}
            {'  ·  Tap to dismiss'}
          </Text>
        </Pressable>
      )}
      <FlatList
        style={{ width }}
        data={photos}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <Post photo={item} width={width} />}
        getItemLayout={postLayout(photos, width)}
        refreshing={query.isRefetching}
        onRefresh={async () => {
          const before = new Set(photos.map((p) => p.id));
          const res = await query.refetch();
          activity.refetch();
          if (res.data?.some((p) => !before.has(p.id))) setSeed(Math.floor(Math.random() * 2 ** 31));
        }}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  banner: {
    width: '100%',
    maxWidth: 600,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.likeTint,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  bannerText: { color: colors.text, fontWeight: '600', fontSize: 14, textAlign: 'center' },
}));
