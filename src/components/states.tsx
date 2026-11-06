import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { fonts, Text } from '@/components/text';

import { colors, MAX_CONTENT_WIDTH, themed, useTheme } from '@/lib/theme';

export function useContentWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width, MAX_CONTENT_WIDTH);
}

export function Loading() {
  useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator />
    </View>
  );
}

function usePulse() {
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return opacity;
}

/** Stand-in for a list of posts while the first photos load. */
export function FeedSkeleton() {
  useTheme();
  const width = useContentWidth();
  const opacity = usePulse();
  return (
    <View style={styles.skeletonWrap} accessibilityLabel="Loading photos" accessibilityRole="progressbar">
      <Animated.View style={{ width, opacity }}>
        {[0, 1].map((i) => (
          <View key={i} style={{ marginBottom: 16 }}>
            <View style={styles.skeletonHeader}>
              <View style={styles.skeletonAvatar} />
              <View style={styles.skeletonLine} />
            </View>
            <View style={{ width, height: width * 1.1, backgroundColor: colors.placeholder }} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

/** Stand-in for an album's photo grid. */
export function GridSkeleton({ columns = 3, gap = 2 }: { columns?: number; gap?: number }) {
  useTheme();
  const width = useContentWidth();
  const opacity = usePulse();
  const tile = (width - gap * (columns - 1)) / columns;
  return (
    <View style={styles.skeletonWrap} accessibilityLabel="Loading photos" accessibilityRole="progressbar">
      <Animated.View style={{ width, opacity, flexDirection: 'row', flexWrap: 'wrap', gap, paddingTop: 140 }}>
        {Array.from({ length: columns * 5 }, (_, i) => (
          <View key={i} style={{ width: tile, height: tile, backgroundColor: colors.placeholder }} />
        ))}
      </Animated.View>
    </View>
  );
}

export function Message({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}) {
  useTheme();
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? (
        <Pressable onPress={onAction} style={styles.btn}>
          <Text style={styles.btnText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 20, fontFamily: fonts.headingRegular, color: colors.text, textAlign: 'center' },
  body: { color: colors.muted, textAlign: 'center' },
  btn: { marginTop: 8, backgroundColor: colors.accent, minHeight: 48, justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 999 },
  btnText: { color: colors.onAccent, fontWeight: '700' },
  skeletonWrap: { flex: 1, alignItems: 'center', overflow: 'hidden' },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingHorizontal: 12 },
  skeletonAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.placeholder },
  skeletonLine: { width: 140, height: 14, borderRadius: 7, backgroundColor: colors.placeholder },
}));
