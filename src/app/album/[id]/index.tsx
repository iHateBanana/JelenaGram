import { MaterialIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { fonts, Text } from '@/components/text';

import { Avatar } from '@/components/avatar';
import { Loading, Message, useContentWidth } from '@/components/states';
import { deletePhoto, fetchAlbum, fetchAlbumPhotos, setAlbumCover, syncAlbum, type SyncProgress } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { downloadAlbumZip, supportsZip } from '@/lib/export-zip';
import { pickPhotos } from '@/lib/media';
import { palette, colors, themed, useTheme } from '@/lib/theme';
import type { Photo } from '@/lib/types';

const COLUMNS = 3;
const GAP = 2;
const INVALIDATE = ['album', 'albumPhotos', 'myAlbums', 'feed', 'albumComments', 'favorites'];

type Row = { key: string; header?: string; tiles?: { photo: Photo; index: number }[] };

function buildRows(photos: Photo[], timeline: boolean): Row[] {
  const rows: Row[] = [];
  const indexed = photos.map((photo, index) => ({ photo, index }));
  if (!timeline) {
    for (let i = 0; i < indexed.length; i += COLUMNS) rows.push({ key: `r${i}`, tiles: indexed.slice(i, i + COLUMNS) });
    return rows;
  }
  const groups = new Map<string, typeof indexed>();
  for (const item of indexed) {
    const d = new Date(item.photo.taken_at);
    const label = Number.isNaN(d.getTime()) ? 'Undated' : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    (groups.get(label) ?? groups.set(label, []).get(label)!).push(item);
  }
  for (const [label, items] of groups) {
    rows.push({ key: `h-${label}`, header: `${label}  ·  ${items.length}` });
    for (let i = 0; i < items.length; i += COLUMNS) rows.push({ key: `${label}-${i}`, tiles: items.slice(i, i + COLUMNS) });
  }
  return rows;
}

function notify(msg: string) {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert(msg);
}

export default function AlbumProfile() {
  useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const width = useContentWidth();
  const tile = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timeline, setTimeline] = useState(false);
  const [uploading, setUploading] = useState<SyncProgress | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const [working, setWorking] = useState(false);

  const album = useQuery({ queryKey: ['album', id], queryFn: () => fetchAlbum(id), enabled: !!id });
  const photos = useQuery({
    queryKey: ['albumPhotos', id, me],
    queryFn: () => fetchAlbumPhotos(id, me!),
    enabled: !!id && !!me,
  });

  const rows = useMemo(() => buildRows(photos.data ?? [], timeline), [photos.data, timeline]);

  const invalidateAll = () => {
    for (const key of INVALIDATE) qc.invalidateQueries({ queryKey: [key] });
  };

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const toggle = (pid: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(pid)) next.add(pid);
      return next;
    });

  const removeSelected = async () => {
    const chosen = (photos.data ?? []).filter((p) => selected.has(p.id));
    if (chosen.length === 0) return;
    const ok = await confirm(
      `Remove ${chosen.length} photo${chosen.length === 1 ? '' : 's'}?`,
      'They will be deleted from JelenaGram. Your phone is untouched.',
      'Remove',
    );
    if (!ok) return;
    setWorking(true);
    try {
      for (const p of chosen) await deletePhoto(p);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setWorking(false);
      exitSelect();
      invalidateAll();
    }
  };

  const coverFromSelected = async () => {
    const photo = (photos.data ?? []).find((p) => selected.has(p.id));
    if (!photo) return;
    setWorking(true);
    try {
      await setAlbumCover(id, photo.path);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setWorking(false);
      exitSelect();
      invalidateAll();
    }
  };

  const addPhotos = async () => {
    if (!album.data) return;
    try {
      const sources = await pickPhotos();
      if (sources.length === 0) return;
      setUploading({ done: 0, total: sources.length });
      await syncAlbum(album.data, sources, setUploading);
      invalidateAll();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const exportZip = async () => {
    if (!album.data || !photos.data?.length) return;
    try {
      setExporting(0);
      const files = photos.data.map((p, i) => ({ url: p.url, name: `${String(i + 1).padStart(3, '0')}.jpg` }));
      await downloadAlbumZip(album.data.name, files, setExporting);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

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
  const isOwner = a.owner_id === me;
  const count = selected.size;

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Stack.Screen options={{ title: a.name }} />
      <FlatList
        style={{ width }}
        data={rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={
          <View>
            {selecting && (
              <Text style={styles.pickHint}>
                {count === 0 ? 'Tap photos to select them.' : `${count} selected`}
              </Text>
            )}
            <View style={styles.header}>
              <Avatar uri={a.coverUrl} name={a.name} size={86} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {a.name}
                </Text>
                <Text style={styles.count}>
                  <Text style={styles.countNum}>{a.photoCount}</Text> {a.photoCount === 1 ? 'post' : 'posts'}
                </Text>
                <View style={styles.links}>
                  <Pressable onPress={() => router.push({ pathname: '/album/[id]/comments', params: { id: a.id } })}>
                    <Text style={styles.link}>All comments</Text>
                  </Pressable>
                  {isOwner && (
                    <Pressable disabled={!!uploading} onPress={addPhotos}>
                      <Text style={styles.link}>
                        {uploading ? `Uploading ${uploading.done} of ${uploading.total}…` : 'Add photos'}
                      </Text>
                    </Pressable>
                  )}
                  {isOwner && (
                    <Pressable onPress={() => (selecting ? exitSelect() : setSelecting(true))}>
                      <Text style={styles.link}>{selecting ? 'Cancel' : 'Select'}</Text>
                    </Pressable>
                  )}
                  {supportsZip && (
                    <Pressable disabled={exporting !== null} onPress={exportZip}>
                      <Text style={styles.link}>
                        {exporting !== null ? `Zipping ${exporting}/${photos.data.length}…` : 'Download zip'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
            <View style={styles.toggle}>
              {[false, true].map((t) => (
                <Pressable key={String(t)} style={[styles.toggleBtn, timeline === t && styles.toggleOn]} onPress={() => setTimeline(t)}>
                  <MaterialIcons
                    name={t ? 'event' : 'grid-on'}
                    size={18}
                    color={timeline === t ? colors.onAccent : colors.text}
                  />
                  <Text style={[styles.toggleText, timeline === t && { color: colors.onAccent }]}>
                    {t ? 'Timeline' : 'Grid'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<Message title="No photos yet" />}
        ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
        renderItem={({ item: row }) =>
          row.header ? (
            <Text style={styles.month}>{row.header}</Text>
          ) : (
            <View style={{ flexDirection: 'row', gap: GAP }}>
              {row.tiles!.map(({ photo, index }) => {
                const on = selected.has(photo.id);
                return (
                  <Pressable
                    key={photo.id}
                    onPress={() =>
                      selecting
                        ? toggle(photo.id)
                        : router.push({ pathname: '/album/[id]/feed', params: { id: a.id, start: String(index) } })
                    }>
                    <Image
                      source={{ uri: photo.url, cacheKey: photo.path }}
                      cachePolicy="memory-disk"
                      style={{ width: tile, height: tile, backgroundColor: colors.placeholder, opacity: on ? 0.55 : 1 }}
                      contentFit="cover"
                      recyclingKey={photo.id}
                    />
                    {selecting && (
                      <View style={[styles.check, on && styles.checkOn]}>
                        {on && <MaterialIcons name="check" size={16} color={colors.onAccent} />}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )
        }
        refreshing={photos.isRefetching}
        onRefresh={() => {
          album.refetch();
          photos.refetch();
        }}
      />
      {selecting && (
        <View style={styles.bulkBar}>
          <Pressable
            style={[styles.bulkBtn, (count !== 1 || working) && styles.disabled]}
            disabled={count !== 1 || working}
            onPress={coverFromSelected}>
            <Text style={styles.bulkText}>Set as cover</Text>
          </Pressable>
          <Pressable
            style={[styles.bulkBtn, styles.bulkDanger, (count === 0 || working) && styles.disabled]}
            disabled={count === 0 || working}
            onPress={removeSelected}>
            <Text style={[styles.bulkText, { color: colors.dot }]}>{count ? `Remove (${count})` : 'Remove'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 20, padding: 16 },
  name: { fontSize: 28, lineHeight: 31, fontFamily: fonts.heading, color: colors.text },
  count: { marginTop: 4, color: colors.muted, fontSize: 15 },
  countNum: { fontWeight: '700', color: colors.text },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2 },
  link: { marginTop: 8, color: colors.link, fontWeight: '600' },
  pickHint: { backgroundColor: colors.likeTint, color: colors.text, padding: 12, textAlign: 'center', fontWeight: '600' },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    overflow: 'hidden',
  },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 16, backgroundColor: colors.card },
  toggleOn: { backgroundColor: colors.accent },
  toggleText: { color: colors.text, fontWeight: '600' },
  month: { color: colors.text, fontFamily: fonts.headingRegular, fontSize: 18, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 6 },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.surface,
    backgroundColor: palette.lilac,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  bulkBar: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    maxWidth: 600,
    padding: 12,
    paddingBottom: 20,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  bulkBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 999, minHeight: 48, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  bulkDanger: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.dot },
  bulkText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.4 },
}));
