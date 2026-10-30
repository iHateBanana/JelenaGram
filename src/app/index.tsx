import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { ActionBar } from '@/components/action-bar';
import { Post, postLayout } from '@/components/post';
import { Loading, Message, useContentWidth } from '@/components/states';
import { fetchFeedAll } from '@/lib/api';
import { useAuth } from '@/lib/auth';

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
  const { me, otherName } = useAuth();
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
      <ActionBar label="My albums" onPress={() => router.push('/my-albums')} />
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
          if (res.data?.some((p) => !before.has(p.id))) setSeed(Math.floor(Math.random() * 2 ** 31));
        }}
      />
    </View>
  );
}
