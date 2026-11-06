import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, View } from 'react-native';

import { usePostList } from '@/components/post';
import { FeedSkeleton, Message, useContentWidth } from '@/components/states';
import { fetchAlbumPhotos } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Photo } from '@/lib/types';

const EMPTY: Photo[] = [];

export default function AlbumFeed() {
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>();
  const { me } = useAuth();
  const width = useContentWidth();

  const photos = useQuery({
    queryKey: ['albumPhotos', id, me],
    queryFn: () => fetchAlbumPhotos(id, me!),
    enabled: !!id && !!me,
  });

  const data = photos.data ?? EMPTY;
  const list = usePostList(data, width);

  if (photos.isPending) return <FeedSkeleton />;
  if (photos.isError) {
    return <Message title="Couldn't load photos" body={photos.error.message} action="Retry" onAction={() => photos.refetch()} />;
  }

  const startIndex = Math.min(Math.max(Number(start) || 0, 0), Math.max(data.length - 1, 0));

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Stack.Screen options={{ title: data[0]?.album.name ?? 'Posts' }} />
      <FlatList
        style={{ width }}
        {...list}
        initialScrollIndex={startIndex}
        refreshing={photos.isRefetching}
        onRefresh={() => photos.refetch()}
      />
    </View>
  );
}
