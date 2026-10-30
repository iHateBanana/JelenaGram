import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionBar } from '@/components/action-bar';
import { Avatar } from '@/components/avatar';
import { Loading, Message, useContentWidth } from '@/components/states';
import { deleteAlbum, fetchMyAlbums, syncAlbum, type SyncProgress } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { listAlbumPhotos, pickPhotos } from '@/lib/media';
import { colors } from '@/lib/theme';
import type { AlbumWithCount } from '@/lib/types';

export default function MyAlbums() {
  const { me, signOut } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const width = useContentWidth();
  const [progress, setProgress] = useState<Record<string, SyncProgress | string>>({});

  const albums = useQuery({ queryKey: ['myAlbums', me], queryFn: () => fetchMyAlbums(me!), enabled: !!me });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['myAlbums'] });
    qc.invalidateQueries({ queryKey: ['album'] });
    qc.invalidateQueries({ queryKey: ['albumPhotos'] });
    qc.invalidateQueries({ queryKey: ['feed'] });
  };

  const remove = useMutation({
    mutationFn: async (album: AlbumWithCount) => {
      if (!(await confirm(`Remove "${album.name}"?`, 'Its photos will be deleted from JelenaGram. Your phone is untouched.', 'Remove')))
        return;
      await deleteAlbum(album.id, me!);
    },
    onSettled: refreshAll,
  });

  const sync = async (album: AlbumWithCount) => {
    try {
      const sources = album.source_album_id ? await listAlbumPhotos(album.source_album_id) : await pickPhotos();
      if (sources.length === 0) return;
      await syncAlbum(album, sources, (p) => setProgress((s) => ({ ...s, [album.id]: p })));
      setProgress((s) => {
        const { [album.id]: _done, ...rest } = s;
        return rest;
      });
    } catch (e) {
      setProgress((s) => ({ ...s, [album.id]: (e as Error).message }));
    } finally {
      refreshAll();
    }
  };

  if (albums.isPending) return <Loading />;
  if (albums.isError) {
    return <Message title="Couldn't load albums" body={albums.error.message} action="Retry" onAction={() => albums.refetch()} />;
  }

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <ActionBar label="Add album" onPress={() => router.push('/add-album')} />
      <FlatList
        style={{ width }}
        data={albums.data}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 16, gap: 16, flexGrow: 1 }}
        ListEmptyComponent={
          <Message
            title="No albums yet"
            body="Connect an album so the other person can see it."
            action="Add album"
            onAction={() => router.push('/add-album')}
          />
        }
        ListFooterComponent={
          <Pressable onPress={signOut} style={{ alignSelf: 'center', padding: 12 }}>
            <Text style={{ color: colors.muted }}>Log out</Text>
          </Pressable>
        }
        renderItem={({ item }) => {
          const p = progress[item.id];
          const canSync = true;
          return (
            <View style={styles.row}>
              <Pressable
                style={styles.info}
                onPress={() => router.push({ pathname: '/album/[id]', params: { id: item.id } })}>
                <Avatar uri={item.coverUrl} name={item.name} size={56} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.count}>
                    {item.photoCount} {item.photoCount === 1 ? 'post' : 'posts'}
                  </Text>
                  {p !== undefined && (
                    <Text style={styles.count}>
                      {typeof p === 'string' ? p : `Uploading ${p.done}/${p.total}…`}
                    </Text>
                  )}
                </View>
              </Pressable>
              <View style={styles.actions}>
                {canSync && (
                  <Pressable onPress={() => sync(item)} disabled={typeof p === 'object'}>
                    <Text style={styles.action}>{item.source_album_id ? 'Sync' : 'Add photos'}</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => router.push({ pathname: '/album/[id]/comments', params: { id: item.id } })}>
                  <Text style={styles.action}>Comments</Text>
                </Pressable>
                <Pressable onPress={() => remove.mutate(item)}>
                  <Text style={[styles.action, { color: colors.like }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 10,
    padding: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
  },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  count: { color: colors.muted, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 20, paddingLeft: 68 },
  action: { color: colors.link, fontWeight: '600' },
});
