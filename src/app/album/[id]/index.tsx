import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Loading, Message, useContentWidth } from '@/components/states';
import { fetchAlbum, fetchAlbumPhotos, setAlbumCover } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

const COLUMNS = 3;
const GAP = 2;

export default function AlbumProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const width = useContentWidth();
  const tile = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  const [picking, setPicking] = useState(false);

  const album = useQuery({ queryKey: ['album', id], queryFn: () => fetchAlbum(id), enabled: !!id });
  const photos = useQuery({
    queryKey: ['albumPhotos', id, me],
    queryFn: () => fetchAlbumPhotos(id, me!),
    enabled: !!id && !!me,
  });

  const changeCover = useMutation({
    mutationFn: (path: string) => setAlbumCover(id, path),
    onSuccess: () => {
      setPicking(false);
      for (const key of ['album', 'albumPhotos', 'myAlbums', 'feed']) qc.invalidateQueries({ queryKey: [key] });
    },
  });

  if (album.isPending || photos.isPending) return <Loading />;
  if (album.isError || photos.isError) {
    return (
      <Message
        title="Couldn't load this album"
        body={(album.error ?? photos.error)?.message}
        action="Retry"
        onAction={() => {
          album.refetch();
          photos.refetch();
        }}
      />
    );
  }
  if (!album.data) return <Message title="Album not found" />;

  const a = album.data;
  const data = photos.data;

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Stack.Screen options={{ title: a.name }} />
      <FlatList
        style={{ width }}
        data={data}
        numColumns={COLUMNS}
        keyExtractor={(p) => p.id}
        columnWrapperStyle={{ gap: GAP }}
        ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
        ListHeaderComponent={
          <View>
            {picking && <Text style={styles.pickHint}>Tap a photo to use it as the album photo.</Text>}
            <View style={styles.header}>
            <Avatar uri={a.coverUrl} name={a.name} size={86} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>
                {a.name}
              </Text>
              <Text style={styles.count}>
                <Text style={styles.countNum}>{a.photoCount}</Text> {a.photoCount === 1 ? 'post' : 'posts'}
              </Text>
              <Pressable onPress={() => router.push({ pathname: '/album/[id]/comments', params: { id: a.id } })}>
                <Text style={styles.commentsLink}>All comments</Text>
              </Pressable>
              {a.owner_id === me && (
                <Pressable onPress={() => setPicking((p) => !p)}>
                  <Text style={styles.commentsLink}>{picking ? 'Cancel' : 'Change album photo'}</Text>
                </Pressable>
              )}
            </View>
            </View>
          </View>
        }
        ListEmptyComponent={<Message title="No photos yet" />}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() =>
              picking
                ? changeCover.mutate(item.path)
                : router.push({ pathname: '/album/[id]/feed', params: { id: a.id, start: String(index) } })
            }>
            <Image
              source={{ uri: item.url }}
              style={{ width: tile, height: tile, backgroundColor: colors.placeholder }}
              contentFit="cover"
              recyclingKey={item.id}
            />
          </Pressable>
        )}
        refreshing={photos.isRefetching}
        onRefresh={() => {
          album.refetch();
          photos.refetch();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 20, padding: 16 },
  name: { fontSize: 20, fontWeight: '700', color: colors.text },
  count: { marginTop: 4, color: colors.muted, fontSize: 15 },
  countNum: { fontWeight: '700', color: colors.text },
  commentsLink: { marginTop: 8, color: colors.link, fontWeight: '600' },
  pickHint: { backgroundColor: colors.likeTint, color: colors.text, padding: 12, textAlign: 'center', fontWeight: '600' },
});
