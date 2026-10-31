import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { updateDisplayName, updatePassword } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { biometricAvailable, getBiometricEnabled, setBiometricEnabled } from '@/lib/biometric';
import { colors, MAX_CONTENT_WIDTH, themed, useTheme, type SchemePreference } from '@/lib/theme';

const MODES: { value: SchemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function notify(title: string, body?: string) {
  if (Platform.OS === 'web') window.alert(body ? `${title}\n${body}` : title);
  else Alert.alert(title, body);
}

export default function Settings() {
  const { preference, setPreference } = useTheme();
  const { me, profiles, signOut } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(false);

  useEffect(() => {
    if (me && profiles[me]) setName((n) => n || profiles[me]);
  }, [me, profiles]);

  useEffect(() => {
    biometricAvailable().then(setBioAvailable);
    getBiometricEnabled().then(setBioOn);
  }, []);

  const saveName = async () => {
    if (!me || !name.trim()) return;
    setBusy(true);
    try {
      await updateDisplayName(me, name);
      await qc.invalidateQueries({ queryKey: ['profiles'] });
      notify('Name updated');
    } catch (e) {
      notify('Could not update name', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (pw.length < 8) return notify('Password too short', 'Use at least 8 characters.');
    if (pw !== pw2) return notify("Passwords don't match");
    setBusy(true);
    try {
      await updatePassword(pw);
      setPw('');
      setPw2('');
      notify('Password changed');
    } catch (e) {
      notify('Could not change password', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleBio = async (on: boolean) => {
    setBioOn(on);
    await setBiometricEnabled(on);
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.col}>
        <Text style={styles.heading}>Display name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.muted} />
        <Pressable style={styles.button} onPress={saveName} disabled={busy}>
          <Text style={styles.buttonText}>Save name</Text>
        </Pressable>

        <Text style={styles.heading}>Change password</Text>
        <TextInput style={styles.input} value={pw} onChangeText={setPw} placeholder="New password" placeholderTextColor={colors.muted} secureTextEntry autoCapitalize="none" />
        <TextInput style={styles.input} value={pw2} onChangeText={setPw2} placeholder="Confirm new password" placeholderTextColor={colors.muted} secureTextEntry autoCapitalize="none" />
        <Pressable style={styles.button} onPress={savePassword} disabled={busy}>
          <Text style={styles.buttonText}>Change password</Text>
        </Pressable>

        <Text style={styles.heading}>Appearance</Text>
        <View style={styles.segment}>
          {MODES.map((m) => (
            <Pressable key={m.value} style={[styles.seg, preference === m.value && styles.segOn]} onPress={() => setPreference(m.value)}>
              <Text style={[styles.segText, preference === m.value && styles.segTextOn]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        {bioAvailable && (
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Lock with Face ID</Text>
              <Text style={styles.hint}>Ask for Face ID when you open the app.</Text>
            </View>
            <Switch value={bioOn} onValueChange={toggleBio} />
          </View>
        )}

        <Pressable style={[styles.button, styles.logout]} onPress={signOut} accessibilityRole="button">
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { alignItems: 'center', padding: 16, paddingBottom: 48 },
  col: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 10 },
  heading: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginTop: 18 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  button: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  buttonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  seg: { flex: 1, paddingVertical: 11, alignItems: 'center', backgroundColor: colors.card },
  segOn: { backgroundColor: colors.accent },
  segText: { color: colors.text, fontWeight: '600' },
  segTextOn: { color: colors.onAccent },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  switchTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 13 },
  logout: { marginTop: 28, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.dot },
  logoutText: { color: colors.dot, fontWeight: '700', fontSize: 16 },
}));
