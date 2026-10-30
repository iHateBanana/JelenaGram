import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Loading, Message, useContentWidth } from '@/components/states';
import { fetchAlbumComments } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function AlbumComments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { nameOf } = useAuth();
  const router = useRouter();
  const width = useContentWidth();

  const comments = useQuery({ queryKey: ['albumComments', id], queryFn: () => fetchAlbumComments(id), enabled: !!id });

  if (comments.isPending) return <Loading />;
  if (comments.isError) {
    return <Message title="Couldn't load comments" body={comments.error.message} action="Retry" onAction={() => comments.refetch()} />;
  }

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <FlatList
        style={{ width }}
        data={comments.data}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        ListEmptyComponent={<Message title="No comments yet" body="Comments on this album's photos will show up here." />}
        refreshing={comments.isRefetching}
        onRefresh={() => comments.refetch()}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push({ pathname: '/photo/[id]/comments', params: { id: item.photo_id } })}>
            <Image source={{ uri: item.photoUrl }} style={styles.thumb} contentFit="cover" recyclingKey={item.id} />
            <View style={{ flex: 1 }}>
              <Text style={styles.author}>{nameOf(item.user_id)}</Text>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
  },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.placeholder },
  author: { fontWeight: '700', color: colors.text },
  body: { color: colors.text, marginTop: 2, fontSize: 15 },
  date: { color: colors.muted, fontSize: 12, marginTop: 4 },
});
