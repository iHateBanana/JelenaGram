import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { fonts, Text } from '@/components/text';

import { ActionSheet, type SheetOption } from '@/components/action-sheet';
import { Avatar } from '@/components/avatar';
import { GridSkeleton, Message, useContentWidth } from '@/components/states';
import { deletePhotos, fetchAlbum, fetchAlbumPhotos, setAlbumCover, syncAlbum, type SyncProgress } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm, notify } from '@/lib/confirm';
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

const RowGap = () => <View style={{ height: GAP }} />;

/** Memoized so selecting one photo doesn't re-render every photo on screen. */
const GridTile = memo(function GridTile({
  photo,
  index,
  size,
  selecting,
  on,
  onPress,
  onLongPress,
}: {
  photo: Photo;
  index: number;
  size: number;
  selecting: boolean;
  on: boolean;
  onPress: (photoId: string, index: number) => void;
  onLongPress?: (photoId: string) => void;
}) {
  useTheme();
  return (
    <Pressable
      onPress={() => onPress(photo.id, index)}
      onLongPress={onLongPress ? () => onLongPress(photo.id) : undefined}
      accessibilityRole="button"
      accessibilityLabel={selecting ? (on ? 'Selected photo' : 'Select photo') : 'Open photo'}>
      <Image
        source={{ uri: photo.thumbUrl ?? photo.url, cacheKey: photo.thumbKey }}
        cachePolicy="memory-disk"
        style={{ width: size, height: size, backgroundColor: colors.placeholder, opacity: on ? 0.55 : 1 }}
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
});

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
  const [menuOpen, setMenuOpen] = useState(false);

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

  const onTilePress = useCallback(
    (photoId: string, index: number) => {
      if (!selecting) {
        router.push({ pathname: '/album/[id]/feed', params: { id, start: String(index) } });
        return;
      }
      setSelected((s) => {
        const next = new Set(s);
        if (!next.delete(photoId)) next.add(photoId);
        return next;
      });
    },
    [selecting, router, id],
  );

  const onTileLongPress = useCallback((photoId: string) => {
    setSelecting(true);
    setSelected((s) => new Set(s).add(photoId));
  }, []);

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
      await deletePhotos(chosen);
    } catch (e) {
      notify('Could not remove photos', (e as Error).message);
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
      notify('Could not set the cover', (e as Error).message);
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
      const { failed } = await syncAlbum(album.data, sources, setUploading);
      invalidateAll();
      if (failed > 0) notify(`${failed} photo${failed === 1 ? '' : 's'} could not upload`, 'Check your connection and try adding them again.');
    } catch (e) {
      notify('Could not add photos', (e as Error).message);
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
      notify('Could not create the zip', (e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  if (album.isPending || photos.isPending) return <GridSkeleton columns={COLUMNS} gap={GAP} />;
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

  const menu: SheetOption[] = [
    ...(isOwner ? [{ label: 'Select photos', onPress: () => setSelecting(true) }] : []),
    ...(supportsZip ? [{ label: 'Download zip', onPress: exportZip }] : []),
  ];

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Stack.Screen
        options={{
          title: a.name,
          headerRight: selecting
            ? () => (
                <Pressable onPress={exitSelect} accessibilityRole="button" style={styles.headerBtn}>
                  <Text style={styles.headerBtnText}>Cancel</Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <FlatList
        style={{ width }}
        data={rows}
        keyExtractor={(r) => r.key}
        windowSize={5}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Avatar uri={a.coverUrl} cacheKey={a.coverKey} name={a.name} size={72} />
              <View style={{ flex: 1, gap: 10 }}>
                <Text style={styles.count}>
                  <Text style={styles.countNum}>{a.photoCount}</Text> {a.photoCount === 1 ? 'post' : 'posts'}
                  {exporting !== null ? `  ·  Zipping ${exporting}/${photos.data.length}…` : ''}
                </Text>
                <View style={styles.buttons}>
                  {isOwner && (
                    <Pressable style={[styles.btn, styles.btnMain]} disabled={!!uploading} onPress={addPhotos} accessibilityRole="button">
                      <Text style={styles.btnMainText} numberOfLines={1}>
                        {uploading ? `Uploading ${uploading.done}/${uploading.total}…` : 'Add photos'}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={styles.btn}
                    onPress={() => router.push({ pathname: '/album/[id]/comments', params: { id: a.id } })}
                    accessibilityRole="button">
                    <Text style={styles.btnText}>Comments</Text>
                  </Pressable>
                  {menu.length > 0 && (
                    <Pressable style={styles.moreBtn} onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="More options">
                      <MaterialIcons name="more-horiz" size={22} color={colors.text} />
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
        ItemSeparatorComponent={RowGap}
        renderItem={({ item: row }) =>
          row.header ? (
            <Text style={styles.month}>{row.header}</Text>
          ) : (
            <View style={{ flexDirection: 'row', gap: GAP }}>
              {row.tiles!.map(({ photo, index }) => (
                <GridTile
                  key={photo.id}
                  photo={photo}
                  index={index}
                  size={tile}
                  selecting={selecting}
                  on={selected.has(photo.id)}
                  onPress={onTilePress}
                  onLongPress={isOwner ? onTileLongPress : undefined}
                />
              ))}
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
          <Text style={styles.bulkCount}>{count === 0 ? 'Tap photos to select them' : `${count} selected`}</Text>
          <View style={styles.bulkButtons}>
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
        </View>
      )}
      <ActionSheet visible={menuOpen} options={menu} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 },
  count: { color: colors.muted, fontSize: 15 },
  countNum: { fontSize: 15, fontWeight: '700', color: colors.text },
  buttons: { flexDirection: 'row', gap: 8 },
  btn: { flexGrow: 1, flexShrink: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.likeTint, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  btnMain: { backgroundColor: colors.accent },
  btnMainText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  moreBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.likeTint, alignItems: 'center', justifyContent: 'center' },
  headerBtn: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  headerBtnText: { color: colors.link, fontSize: 16, fontWeight: '700' },
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
  toggleText: { color: colors.text, fontSize: 15, fontWeight: '600' },
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
    gap: 10,
    width: '100%',
    maxWidth: 600,
    padding: 12,
    paddingBottom: 20,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  bulkCount: { color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  bulkButtons: { flexDirection: 'row', gap: 10 },
  bulkBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 999, minHeight: 48, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  bulkDanger: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.dot },
  bulkText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.4 },
}));
