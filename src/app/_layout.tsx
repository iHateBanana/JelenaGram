import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { fonts, Text } from '@/components/text';

import { DialogHost } from '@/components/dialogs';
import { HeartsProvider } from '@/components/hearts';
import { ViewerProvider } from '@/components/photo-viewer';
// Per-weight imports: the package index pulls every weight (36 font files) into the build.
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Fraunces_600SemiBold_Italic } from '@expo-google-fonts/fraunces/600SemiBold_Italic';
import { useFonts } from 'expo-font';
import { AuthProvider, useAuth } from '@/lib/auth';
import { BiometricGate } from '@/lib/biometric';
import { colors, ThemeProvider, useTheme } from '@/lib/theme';

const WEEK = 7 * 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, gcTime: WEEK } },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'jg.query-cache', throttleTime: 2000 });

/**
 * Only the screens people open first are saved for instant start-up. Saving every album, comment
 * thread and activity count bloated storage (web localStorage caps at ~5 MB) and slowed every write.
 */
const PERSISTED = new Set(['feed', 'myAlbums', 'profiles', 'favorites']);

// On phones, tell React Query when the app is in the foreground: polling pauses in the background
// and data refreshes on return.
if (Platform.OS !== 'web') {
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => sub.remove();
  });
}

function RootStack() {
  const { session, loading } = useAuth();
  useTheme();
  const [fontsLoaded, fontError] = useFonts({ Nunito_400Regular, Nunito_700Bold, Fraunces_600SemiBold_Italic });

  if (loading || (!fontsLoaded && !fontError)) {
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
        headerTitleAlign: 'center',
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text, fontFamily: fonts.heading, fontSize: 22 },
        headerBackTitleStyle: { fontFamily: fonts.regular },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
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
      <PersistQueryClientProvider client={queryClient} persistOptions={{
          persister,
          maxAge: WEEK,
          buster: 'v3',
          dehydrateOptions: {
            shouldDehydrateQuery: (q) => q.state.status === 'success' && PERSISTED.has(String(q.queryKey[0])),
          },
        }}>
        <AuthProvider>
          <HeartsProvider>
            <BiometricGate>
              <ViewerProvider>
                <ThemedStatusBar />
                <RootStack />
                <DialogHost />
              </ViewerProvider>
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
