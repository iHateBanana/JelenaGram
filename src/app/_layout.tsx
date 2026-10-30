import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RootStack() {
  const { session, loading } = useAuth();

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
            headerRight: () => (
              <Link href="/my-albums" asChild>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: colors.text,
                    opacity: pressed ? 0.8 : 1,
                    marginRight: 4,
                  })}>
                  <Text style={{ color: colors.bg, fontWeight: '600', fontSize: 14 }}>My albums</Text>
                </Pressable>
              </Link>
            ),
          }}
        />
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

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootStack />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: colors.text }}>{error.message}</Text>
    </View>
  );
}
