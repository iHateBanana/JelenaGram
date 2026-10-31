import * as MediaLibrary from 'expo-media-library';
import { File, Paths } from 'expo-file-system';

export async function savePhoto(url: string, name: string): Promise<'saved' | 'denied'> {
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) return 'denied';
  const target = new File(Paths.cache, `${name}.jpg`);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target);
  await MediaLibrary.saveToLibraryAsync(file.uri);
  return 'saved';
}
