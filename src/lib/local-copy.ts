import { File, Paths } from 'expo-file-system';

/** Downloads a remote image to a temporary local file, which the image tools need. */
export async function downloadToLocal(url: string, name: string): Promise<{ uri: string; release: () => void }> {
  const target = new File(Paths.cache, name);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target);
  return {
    uri: file.uri,
    release: () => {
      if (target.exists) target.delete();
    },
  };
}
