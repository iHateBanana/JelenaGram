export type Album = {
  id: string;
  owner_id: string;
  name: string;
  cover_path: string | null;
  source_album_id: string | null;
  /** A small version of the cover when one exists, otherwise the full photo. */
  coverUrl: string | null;
  /** Image cache key matching coverUrl. */
  coverKey: string | null;
};

export type AlbumWithCount = Album & { photoCount: number };

export type Photo = {
  id: string;
  album_id: string;
  path: string;
  url: string;
  /** Small version for grids and placeholders. Null until one exists. */
  thumbUrl: string | null;
  /** Image cache key for the small version (or the full photo when there is none). */
  thumbKey: string;
  width: number | null;
  height: number | null;
  taken_at: string;
  created_at: string;
  album: Album;
  likesByUser: Record<string, number>;
  myLikes: number;
  likeTotal: number;
  commentCount: number;
  favorited: boolean;
};

export type Comment = {
  id: string;
  photo_id: string;
  user_id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
};

export type Profiles = Record<string, string>;
