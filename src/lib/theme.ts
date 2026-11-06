import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';

/** Brand design tokens. The single source of truth for colours, radii and spacing. */
export const palette = {
  forest: '#2A5C47',
  sage: '#CFE5D6',
  lavender: '#A590CF',
  lilac: '#E6DAF5',
  plum: '#5E4580',
  moonlight: '#FBF7F1',
  ink: '#2B2236',
  surface: '#FFFFFF',
  rose: '#D6336C',
  blush: '#F7A8C0',
};

export const radius = { sm: 16, card: 24, pill: 999 };
export const space = { xs: 8, sm: 16, md: 24, lg: 32, xl: 48 };

const light = {
  bg: palette.moonlight,
  text: palette.ink,
  muted: palette.plum,
  border: palette.lilac,
  accent: palette.lavender,
  onAccent: palette.ink,
  forest: palette.forest,
  onForest: palette.moonlight,
  link: palette.plum,
  like: palette.rose,
  likeTint: palette.lilac,
  placeholder: palette.lilac,
  card: palette.surface,
  badge: palette.lavender,
  dot: palette.plum,
};

const dark: typeof light = {
  bg: '#1A1424',
  text: palette.moonlight,
  muted: '#CDBDEA',
  border: '#3A2F4D',
  accent: palette.lavender,
  onAccent: palette.ink,
  forest: palette.forest,
  onForest: palette.moonlight,
  link: '#CDBDEA',
  like: '#FF7AA2',
  likeTint: '#3A2F4D',
  placeholder: '#33284A',
  card: palette.ink,
  badge: palette.lavender,
  dot: palette.lilac,
};
export type Scheme = 'light' | 'dark';
export type SchemePreference = 'system' | Scheme;

/** Mutable on purpose: swapped in place when the scheme changes, then screens re-render via useTheme(). */
export const colors: typeof light = { ...light };

let version = 0;

function applyScheme(scheme: Scheme) {
  Object.assign(colors, scheme === 'dark' ? dark : light);
  version += 1;
}

/** Style sheets rebuilt lazily whenever the scheme changes. */
export function themed<T extends object>(factory: () => T): T {
  let cache: T | null = null;
  let builtFor = -1;
  return new Proxy({} as T, {
    get(_, prop) {
      if (!cache || builtFor !== version) {
        cache = factory();
        builtFor = version;
      }
      return (cache as Record<string | symbol, unknown>)[prop];
    },
  });
}

type ThemeValue = {
  scheme: Scheme;
  preference: SchemePreference;
  setPreference: (p: SchemePreference) => void;
};

const ThemeContext = createContext<ThemeValue>({ scheme: 'light', preference: 'system', setPreference: () => {} });

const PREF_KEY = 'jg.theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<SchemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(PREF_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
    });
  }, []);

  const scheme: Scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  // Applied during render so children read the right colors on this very pass.
  const [applied, setApplied] = useState<Scheme | null>(null);
  if (applied !== scheme) {
    applyScheme(scheme);
    setApplied(scheme);
  }

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const bg = scheme === 'dark' ? dark.bg : light.bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
    document.documentElement.style.backgroundColor = bg;
    document.documentElement.style.colorScheme = scheme;
    document.body.style.backgroundColor = bg;
  }, [scheme]);

  const setPreference = useCallback((p: SchemePreference) => {
    setPref(p);
    AsyncStorage.setItem(PREF_KEY, p).catch(() => {});
  }, []);

  const value = useMemo(() => ({ scheme, preference, setPreference }), [scheme, preference, setPreference]);
  return createElement(ThemeContext.Provider, { value }, children);
}

/** Call in any component that reads `colors` or themed styles so it re-renders on scheme change. */
export function useTheme() {
  return useContext(ThemeContext);
}

export const MAX_CONTENT_WIDTH = 600;
