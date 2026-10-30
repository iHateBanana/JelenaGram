import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useWindowDimensions } from 'react-native';

import { colors, MAX_CONTENT_WIDTH } from '@/lib/theme';

export function useContentWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width, MAX_CONTENT_WIDTH);
}

export function Loading() {
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 18, fontWeight: '600', color: colors.text, textAlign: 'center' },
  body: { color: colors.muted, textAlign: 'center' },
  btn: { marginTop: 8, backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  btnText: { color: colors.onAccent, fontWeight: '700' },
});
