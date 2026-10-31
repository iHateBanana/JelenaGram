import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { fonts, Text } from '@/components/text';
import { useWindowDimensions } from 'react-native';

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
}));
