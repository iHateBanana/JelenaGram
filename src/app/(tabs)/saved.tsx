import { useQuery } from '@tanstack/react-query';
import { FlatList, View } from 'react-native';

import { usePostList } from '@/components/post';
import { FeedSkeleton, Message, useContentWidth } from '@/components/states';
import { fetchFavorites } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import type { Photo } from '@/lib/types';

const EMPTY: Photo[] = [];

export default function Saved() {
  useTheme();
  const { me } = useAuth();
  const width = useContentWidth();
  const query = useQuery({ queryKey: ['favorites', me], enabled: !!me, queryFn: () => fetchFavorites(me!) });
  const list = usePostList(query.data ?? EMPTY, width);

  if (query.isPending) return <FeedSkeleton />;
  if (query.isError) {
    return <Message title="Couldn't load saved photos" body={query.error.message} action="Retry" onAction={() => query.refetch()} />;
  }
  if (query.data.length === 0) {
    return <Message title="Nothing saved yet" body="Tap the bookmark on any photo to find it here later." />;
  }

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <FlatList
        style={{ width }}
        {...list}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
      />
    </View>
  );
}
