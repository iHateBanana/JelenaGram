export type DeviceAlbum = { id: string; title: string; count: number };

export type SourcePhoto = {
  key: string;
  takenAt: string;
  getUri: () => Promise<string>;
};
