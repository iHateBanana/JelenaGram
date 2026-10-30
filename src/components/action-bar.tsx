import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, MAX_CONTENT_WIDTH } from '@/lib/theme';

export function ActionBar({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" style={styles.button} onPress={onPress}>
        <Text style={styles.text}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, paddingHorizontal: 16, paddingVertical: 10 },
  button: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  text: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
});
