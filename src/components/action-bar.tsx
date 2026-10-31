import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { colors, MAX_CONTENT_WIDTH, themed, useTheme } from '@/lib/theme';

export type BarAction = { label: string; onPress: () => void; dot?: boolean; secondary?: boolean };

export function ActionBar({ label, onPress, actions }: { label?: string; onPress?: () => void; actions?: BarAction[] }) {
  useTheme();
  const items: BarAction[] = actions ?? [{ label: label ?? '', onPress: onPress ?? (() => {}) }];
  return (
    <View style={styles.bar}>
      {items.map((a) => (
        <Pressable
          key={a.label}
          accessibilityRole="button"
          style={[styles.button, a.secondary && styles.secondary]}
          onPress={a.onPress}>
          <Text style={[styles.text, a.secondary && styles.secondaryText]}>{a.label}</Text>
          {a.dot && <View style={styles.dot} />}
        </Pressable>
      ))}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  bar: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 999,
    minHeight: 48,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondary: { backgroundColor: colors.forest },
  text: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  secondaryText: { color: colors.onForest },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.dot },
}));
