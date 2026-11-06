import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { colors, themed, useTheme } from '@/lib/theme';

export function Avatar({
  uri,
  cacheKey,
  name,
  size = 36,
}: {
  uri: string | null;
  /** Storage path. Signed URLs change over time; caching by path keeps the image cached on disk. */
  cacheKey?: string | null;
  name: string;
  size?: number;
}) {
  useTheme();
  const radius = size / 2;
  return uri ? (
    <Image
      source={{ uri, cacheKey: cacheKey ?? undefined }}
      cachePolicy="memory-disk"
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.placeholder }}
      contentFit="cover"
    />
  ) : (
    <View
      style={[styles.fallback, { width: size, height: size, borderRadius: radius }]}>
      <Text style={{ fontSize: size * 0.45, fontWeight: '600', color: colors.muted }}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  fallback: { backgroundColor: colors.placeholder, alignItems: 'center', justifyContent: 'center' },
}));
