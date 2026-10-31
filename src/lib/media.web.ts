import * as ImagePicker from 'expo-image-picker';

import type { DeviceAlbum, SourcePhoto } from './media-types';

export const supportsDeviceAlbums = false;

export async function listDeviceAlbums(): Promise<DeviceAlbum[]> {
  return [];
}

export async function listAlbumPhotos(_albumId: string): Promise<SourcePhoto[]> {
  return [];
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
    takenAt: new Date(a.file?.lastModified ?? Date.now()).toISOString(),
    getUri: async () => a.uri,
  }));
}
