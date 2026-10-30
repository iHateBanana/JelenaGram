import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, View } from 'react-native';

import { Post, postLayout } from '@/components/post';
import { Loading, Message, useContentWidth } from '@/components/states';
import { fetchAlbumPhotos } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AlbumFeed() {
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>();
  const { me } = useAuth();
  const width = useContentWidth();

  const photos = useQuery({
    queryKey: ['albumPhotos', id, me],
    queryFn: () => fetchAlbumPhotos(id, me!),
    enabled: !!id && !!me,
  });

  if (photos.isPending) return <Loading />;
  if (photos.isError) {
    return <Message title="Couldn't load photos" body={photos.error.message} action="Retry" onAction={() => photos.refetch()} />;
  }

  const data = photos.data;
  const startIndex = Math.min(Math.max(Number(start) || 0, 0), Math.max(data.length - 1, 0));

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Stack.Screen options={{ title: data[0]?.album.name ?? 'Posts' }} />
      <FlatList
        style={{ width }}
        data={data}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <Post photo={item} width={width} />}
        getItemLayout={postLayout(data, width)}
        initialScrollIndex={startIndex}
        refreshing={photos.isRefetching}
        onRefresh={() => photos.refetch()}
      />
    </View>
  );
}
