import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export const palette = {
  forest: '#243E36',
  periwinkle: '#909CC2',
  lavender: '#F3EAF4',
};

const light = {
  bg: '#EDE2EF',
  text: palette.forest,
  muted: '#5B6B70',
  border: '#D9CCDF',
  accent: palette.forest,
  onAccent: '#F8F2F9',
  link: '#4F5F96',
  like: '#6F7DB4',
  likeTint: '#E2E5F4',
  placeholder: '#E2D7E6',
  card: '#FCF9FC',
  badge: palette.periwinkle,
  dot: '#C0525E',
};

const dark: typeof light = {
  bg: '#101815',
  text: palette.lavender,
  muted: '#9AA8A3',
  border: '#2B3B35',
  accent: palette.periwinkle,
  onAccent: '#101815',
  link: '#AEB8DE',
  like: '#AEB8DE',
  likeTint: '#2A3250',
  placeholder: '#1F2C27',
  card: '#18231F',
  badge: palette.periwinkle,
  dot: '#E07A86',
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
