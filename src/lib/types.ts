export type Album = {
  id: string;
  owner_id: string;
  name: string;
  cover_path: string | null;
  source_album_id: string | null;
  coverUrl: string | null;
};

export type AlbumWithCount = Album & { photoCount: number };

export type Photo = {
  id: string;
  album_id: string;
  path: string;
  url: string;
  width: number | null;
  height: number | null;
  taken_at: string;
  album: Album;
  likesByUser: Record<string, number>;
  myLikes: number;
  likeTotal: number;
  commentCount: number;
};

export type Comment = {
  id: string;
  photo_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type Profiles = Record<string, string>;
