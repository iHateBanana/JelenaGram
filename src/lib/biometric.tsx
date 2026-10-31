import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import { fonts, Text } from '@/components/text';

import { colors, themed, useTheme } from '@/lib/theme';

const KEY = 'jg.biometric';
const supported = Platform.OS !== 'web';

export async function biometricAvailable(): Promise<boolean> {
  if (!supported) return false;
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

export async function getBiometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === '1';
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, on ? '1' : '0');
}

/** Covers the app with a lock screen until Face ID succeeds, when the user turned it on. */
export function BiometricGate({ children }: { children: ReactNode }) {
  useTheme();
  const [ready, setReady] = useState(!supported);
  const [locked, setLocked] = useState(false);
  const busy = useRef(false);
  const enabled = useRef(false);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock JelenaGram' });
      if (res.success) setLocked(false);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!supported) return;
    (async () => {
      enabled.current = (await getBiometricEnabled()) && (await biometricAvailable());
      if (enabled.current) {
        setLocked(true);
        unlock();
      }
      setReady(true);
    })();
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background') {
        enabled.current = (await getBiometricEnabled()) && (await biometricAvailable());
        if (enabled.current) setLocked(true);
      } else if (state === 'active' && enabled.current) {
        unlock();
      }
    });
    return () => sub.remove();
  }, [unlock]);

  if (!ready) return <View style={styles.cover} />;
  return (
    <>
      {children}
      {locked && (
        <View style={[StyleSheet.absoluteFill, styles.cover]}>
          <Text style={styles.title}>JelenaGram</Text>
          <Pressable style={styles.button} onPress={unlock} accessibilityRole="button">
            <Text style={styles.buttonText}>Unlock with Face ID</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

const styles = themed(() => StyleSheet.create({
  cover: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 20 },
  title: { fontSize: 30, fontFamily: fonts.heading, color: colors.text },
  button: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 13, paddingHorizontal: 24 },
  buttonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
}));
