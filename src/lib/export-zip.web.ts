export const supportsZip = true;

export async function downloadAlbumZip(
  name: string,
  files: { url: string; name: string }[],
  onProgress: (done: number) => void,
): Promise<void> {
  // Loaded on demand: rarely used, and about 100 KB that every album visit would otherwise download.
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  let done = 0;
  for (const f of files) {
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`Could not download ${f.name}`);
    zip.file(f.name, await res.blob());
    onProgress(++done);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${name.replace(/[^\w\- ]+/g, '').trim() || 'album'}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
