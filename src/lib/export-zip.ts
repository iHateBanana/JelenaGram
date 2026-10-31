export const supportsZip = false;

export async function downloadAlbumZip(_name: string, _urls: { url: string; name: string }[], _onProgress: (done: number) => void): Promise<void> {
  throw new Error('Zip export is only available in the web version.');
}
