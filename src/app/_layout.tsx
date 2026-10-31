import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';

import { HeartsProvider } from '@/components/hearts';
import { AuthProvider, useAuth } from '@/lib/auth';
import { BiometricGate } from '@/lib/biometric';
import { colors, ThemeProvider, useTheme } from '@/lib/theme';

const WEEK = 7 * 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, gcTime: WEEK } },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'jg.query-cache' });

function RootStack() {
  const { session, loading } = useAuth();
  useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen
          name="index"
          options={{
            title: 'JelenaGram',
          }}
        />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="saved" options={{ title: 'Saved' }} />
        <Stack.Screen name="my-albums" options={{ title: 'My albums' }} />
        <Stack.Screen name="add-album" options={{ title: 'Add album', presentation: 'modal' }} />
        <Stack.Screen name="album/[id]/index" options={{ title: 'Album' }} />
        <Stack.Screen name="album/[id]/feed" options={{ title: 'Posts' }} />
        <Stack.Screen name="album/[id]/comments" options={{ title: 'Album comments' }} />
        <Stack.Screen name="photo/[id]/comments" options={{ title: 'Comments' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: WEEK }}>
        <AuthProvider>
          <HeartsProvider>
            <BiometricGate>
              <ThemedStatusBar />
              <RootStack />
            </BiometricGate>
          </HeartsProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: colors.text }}>{error.message}</Text>
    </View>
  );
}
