import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';

import type { DeviceAlbum, SourcePhoto } from './media-types';

export const supportsDeviceAlbums = true;

async function ensurePermission() {
  const current = await MediaLibrary.getPermissionsAsync();
  if (current.granted) return;
  const next = await MediaLibrary.requestPermissionsAsync();
  if (!next.granted) throw new Error('Photo library access was denied. Enable it in Settings.');
}

export async function listDeviceAlbums(): Promise<DeviceAlbum[]> {
  await ensurePermission();
  const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  return albums
    .filter((a) => a.assetCount > 0)
    .map((a) => ({ id: a.id, title: a.title, count: a.assetCount }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function listAlbumPhotos(albumId: string): Promise<SourcePhoto[]> {
  await ensurePermission();
  const out: SourcePhoto[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await MediaLibrary.getAssetsAsync({
      album: albumId,
      mediaType: 'photo',
      first: 200,
      after,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    for (const asset of page.assets) {
      out.push({
        key: asset.id,
        takenAt: new Date(asset.creationTime || Date.now()).toISOString(),
        getUri: async () => {
          const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: true });
          return info.localUri ?? asset.uri;
        },
      });
    }
    if (!page.hasNextPage) break;
    after = page.endCursor;
  }
  return out;
}

export async function pickPhotos(): Promise<SourcePhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 1,
  });
  if (result.canceled) return [];
  return result.assets.map((a) => ({
    key: a.assetId ?? `${a.fileName ?? 'photo'}-${a.fileSize ?? a.uri.length}`,
    takenAt: new Date().toISOString(),
    getUri: async () => a.uri,
  }));
}
