/** Downloads a remote image into memory, which the image tools need. */
export async function downloadToLocal(url: string, _name: string): Promise<{ uri: string; release: () => void }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const uri = URL.createObjectURL(await res.blob());
  return { uri, release: () => URL.revokeObjectURL(uri) };
}
