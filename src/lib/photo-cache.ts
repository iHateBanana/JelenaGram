import type { QueryClient } from '@tanstack/react-query';

import type { Photo } from './types';

const PHOTO_LISTS = ['feed', 'albumPhotos', 'favorites'];

/** The photo from any cached list, so a screen can show it without waiting for a request. */
export function findCachedPhoto(qc: QueryClient, photoId: string): Photo | undefined {
  for (const key of PHOTO_LISTS) {
    for (const [, list] of qc.getQueriesData<Photo[]>({ queryKey: [key] })) {
      const hit = list?.find((p) => p.id === photoId);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Updates one photo in every cached list. Saves refetching whole lists after a small change, and only
 * the changed photo gets a new object, so the other (memoized) posts don't re-render.
 */
export function patchPhoto(qc: QueryClient, photoId: string, patch: (photo: Photo) => Photo) {
  for (const key of PHOTO_LISTS) {
    qc.setQueriesData<Photo[]>({ queryKey: [key] }, (list) => {
      if (!list?.some((p) => p.id === photoId)) return list;
      return list.map((p) => (p.id === photoId ? patch(p) : p));
    });
  }
}
