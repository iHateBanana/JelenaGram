import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Loading, Message } from '@/components/states';
import { createAlbum, deleteAlbum, syncAlbum, type SyncProgress } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { listAlbumPhotos, listDeviceAlbums, pickPhotos, supportsDeviceAlbums } from '@/lib/media';
import type { DeviceAlbum, SourcePhoto } from '@/lib/media-types';
import { colors, MAX_CONTENT_WIDTH } from '@/lib/theme';

export default function AddAlbum() {
  const { me } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [deviceAlbums, setDeviceAlbums] = useState<DeviceAlbum[] | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!supportsDeviceAlbums) return;
    listDeviceAlbums()
      .then(setDeviceAlbums)
      .catch((e: Error) => {
        setError(e.message);
        setDeviceAlbums([]);
      });
  }, []);

  const create = async (albumName: string, sourceAlbumId: string | null, load: () => Promise<SourcePhoto[]>) => {
    if (!me) return;
    setError(null);
    setBusy(albumName);
    let createdId: string | null = null;
    try {
      const sources = await load();
      if (sources.length === 0) {
        setBusy(null);
        return;
      }
      const album = await createAlbum(albumName, sourceAlbumId);
      createdId = album.id;
      await syncAlbum(album, sources, setProgress);
      createdId = null;
      qc.invalidateQueries({ queryKey: ['myAlbums'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
      router.back();
    } catch (e) {
      if (createdId) await deleteAlbum(createdId, me).catch(() => {});
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  if (busy) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.title}>{busy}</Text>
        <Text style={styles.muted}>
          {progress ? `Uploading ${progress.done} of ${progress.total}…` : 'Preparing…'}
        </Text>
        <Text style={styles.muted}>Keep this screen open until it finishes.</Text>
      </View>
    );
  }

  const createForm = (
    <View style={styles.createBox}>
      <Text style={styles.title}>Create a new album</Text>
      <TextInput
        style={styles.input}
        placeholder="Album name"
        placeholderTextColor={colors.muted}
        value={name}
        onChangeText={setName}
      />
      <Pressable
        style={[styles.button, !name.trim() && { opacity: 0.5 }]}
        disabled={!name.trim()}
        onPress={() => create(name.trim(), null, pickPhotos)}>
        <Text style={styles.buttonText}>Choose photos</Text>
      </Pressable>
    </View>
  );

  if (supportsDeviceAlbums) {
    if (!deviceAlbums) return <Loading />;
    return (
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
          {error && <Text style={styles.error}>{error}</Text>}
          <FlatList
            data={deviceAlbums}
            keyExtractor={(a) => a.id}
            ListHeaderComponent={
              <View>
                {createForm}
                <Text style={styles.hint}>Or share an existing album from your phone.</Text>
              </View>
            }
            ListEmptyComponent={<Message title="No albums found" />}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => create(item.title, item.id, () => listAlbumPhotos(item.id))}>
                <Text style={styles.name}>{item.title}</Text>
                <Text style={styles.muted}>{item.count}</Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', padding: 16 }}>
      <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 12 }}>
        <Text style={styles.hint}>
          Browsers can't read your Photos library, so pick the photos you want to share. For automatic album
          syncing use the iPhone app.
        </Text>
        <TextInput style={styles.input} placeholder="Album name" value={name} onChangeText={setName} />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.button, !name.trim() && { opacity: 0.5 }]}
          disabled={!name.trim()}
          onPress={() => create(name.trim(), null, pickPhotos)}>
          <Text style={styles.buttonText}>Choose photos</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  title: { fontSize: 18, fontWeight: '600', color: colors.text },
  muted: { color: colors.muted },
  hint: { color: colors.muted, padding: 16 },
  error: { color: colors.like, paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  name: { fontSize: 16, color: colors.text },
  createBox: {
    margin: 16,
    padding: 14,
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  buttonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
});
