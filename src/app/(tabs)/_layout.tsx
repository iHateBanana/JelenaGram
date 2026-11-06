import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts } from '@/components/text';
import { backfillThumbnails } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, useTheme } from '@/lib/theme';
import { useActivity } from '@/lib/use-activity';

/** Long enough for the first screen to finish loading before background work starts. */
const BACKFILL_DELAY_MS = 5000;
/** Fits the icon and label above the safe area. Nunito is too tall for the default bar height. */
const TAB_BAR_HEIGHT = 60;

export default function TabsLayout() {
  useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const activity = useActivity();
  const newPhotos = activity.data?.newPhotos ?? 0;
  const newComments = activity.data?.newComments ?? 0;

  useEffect(() => {
    if (!me) return;
    const timer = setTimeout(() => {
      backfillThumbnails(me).catch((e) => console.warn('Thumbnail backfill stopped', e));
    }, BACKFILL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [me]);

  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text, fontFamily: fonts.heading, fontSize: 22 },
        headerTintColor: colors.text,
        headerRight: () => (
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
            <MaterialIcons name="settings" size={24} color={colors.text} />
          </Pressable>
        ),
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
        tabBarActiveTintColor: colors.link,
        tabBarInactiveTintColor: colors.muted,
        // flexShrink: without it the icon squeezes the label and cuts off the text.
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, flexShrink: 0 },
        tabBarBadgeStyle: { backgroundColor: colors.like, color: '#fff', fontSize: 11 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'JelenaGram',
          tabBarLabel: 'Home',
          tabBarBadge: newPhotos > 0 ? newPhotos : undefined,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home-filled" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="my-albums"
        options={{
          title: 'My albums',
          tabBarLabel: 'Albums',
          tabBarBadge: newComments > 0 ? newComments : undefined,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="photo-library" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="bookmark" size={size} color={color as string} />,
        }}
      />
    </Tabs>
  );
}
