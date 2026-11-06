import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { colors, MAX_CONTENT_WIDTH, themed, useTheme } from '@/lib/theme';

export function ActionBar({ label, onPress }: { label: string; onPress: () => void }) {
  useTheme();
  return (
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" style={styles.button} onPress={onPress}>
        <Text style={styles.text}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  bar: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    minHeight: 48,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
}));
