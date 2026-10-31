import { useQuery } from '@tanstack/react-query';
import { FlatList, View } from 'react-native';

import { Post, postLayout } from '@/components/post';
import { Loading, Message, useContentWidth } from '@/components/states';
import { fetchFavorites } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function Saved() {
  useTheme();
  const { me } = useAuth();
  const width = useContentWidth();
  const query = useQuery({ queryKey: ['favorites', me], enabled: !!me, queryFn: () => fetchFavorites(me!) });

  if (query.isPending) return <Loading />;
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
        data={query.data}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <Post photo={item} width={width} />}
        getItemLayout={postLayout(query.data, width)}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
      />
    </View>
  );
}
