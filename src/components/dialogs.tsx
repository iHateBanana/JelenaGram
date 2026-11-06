import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, Text } from '@/components/text';
import { subscribeDialogs, type DialogEvent } from '@/lib/confirm';
import { colors, themed, useTheme } from '@/lib/theme';

const TOAST_MS = 3500;
/** Keeps messages clear of the tab bar. */
const TOAST_BOTTOM = 72;

type Toast = Extract<DialogEvent, { kind: 'toast' }>;
type Confirm = Extract<DialogEvent, { kind: 'confirm' }>;

export function DialogHost() {
  useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Toast | null>(null);
  const [ask, setAsk] = useState<Confirm | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeDialogs((event) => {
      if (event.kind === 'confirm') {
        setAsk(event);
        return;
      }
      setToast(event);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), TOAST_MS);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const answer = (ok: boolean) => {
    ask?.resolve(ok);
    setAsk(null);
  };

  return (
    <>
      {toast && (
        <View pointerEvents="none" style={[styles.toastWrap, { bottom: insets.bottom + TOAST_BOTTOM }]}>
          <View style={styles.toast} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text style={styles.toastTitle}>{toast.title}</Text>
            {toast.body ? <Text style={styles.toastBody}>{toast.body}</Text> : null}
          </View>
        </View>
      )}
      {ask && (
        <Modal visible transparent animationType="fade" onRequestClose={() => answer(false)}>
          <Pressable style={styles.backdrop} onPress={() => answer(false)} accessibilityLabel="Cancel">
            <Pressable style={styles.dialog} accessibilityRole="alert">
              <Text style={styles.title}>{ask.title}</Text>
              <Text style={styles.message}>{ask.message}</Text>
              <View style={styles.buttons}>
                <Pressable style={[styles.btn, styles.btnQuiet]} onPress={() => answer(false)} accessibilityRole="button">
                  <Text style={styles.btnQuietText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnMain]} onPress={() => answer(true)} accessibilityRole="button">
                  <Text style={styles.btnMainText}>{ask.confirmText}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const styles = themed(() => StyleSheet.create({
  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { maxWidth: 480, backgroundColor: colors.text, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 16 },
  toastTitle: { color: colors.bg, fontSize: 15, fontWeight: '700' },
  toastBody: { color: colors.bg, fontSize: 14, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 380, backgroundColor: colors.card, borderRadius: 24, padding: 24, gap: 8 },
  title: { fontSize: 22, lineHeight: 28, fontFamily: fonts.heading, color: colors.text },
  message: { fontSize: 15, lineHeight: 22, color: colors.muted },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnQuiet: { backgroundColor: colors.likeTint },
  btnQuietText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  btnMain: { backgroundColor: colors.accent },
  btnMainText: { color: colors.onAccent, fontSize: 16, fontWeight: '700' },
}));
