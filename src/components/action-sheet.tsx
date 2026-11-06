import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { colors, MAX_CONTENT_WIDTH, themed, useTheme } from '@/lib/theme';

export type SheetOption = { label: string; onPress: () => void };

export function ActionSheet({ visible, options, onClose }: { visible: boolean; options: SheetOption[]; onClose: () => void }) {
  useTheme();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          {options.map((o) => (
            <Pressable
              key={o.label}
              style={styles.row}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                o.onPress();
              }}>
              <Text style={styles.label}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12 },
  row: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 24 },
  label: { color: colors.text, fontSize: 17, fontWeight: '600' },
}));
