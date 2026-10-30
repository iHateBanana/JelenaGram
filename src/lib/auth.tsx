import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { fetchProfiles } from './api';
import { supabase } from './supabase';
import type { Profiles } from './types';

type AuthValue = {
  session: Session | null;
  loading: boolean;
  me: string | null;
  profiles: Profiles;
  nameOf: (userId: string) => string;
  otherName: string;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const me = session?.user.id ?? null;
  const { data: profiles = {} } = useQuery({
    queryKey: ['profiles', me],
    queryFn: fetchProfiles,
    enabled: !!me,
    staleTime: Infinity,
  });

  const value = useMemo<AuthValue>(() => {
    const nameOf = (id: string) => (id === me ? 'You' : (profiles[id] ?? 'Someone'));
    const otherId = Object.keys(profiles).find((id) => id !== me);
    return {
      session,
      loading,
      me,
      profiles,
      nameOf,
      otherName: otherId ? profiles[otherId] : 'your partner',
      signOut: async () => {
        await supabase.auth.signOut();
      },
    };
  }, [session, loading, me, profiles]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
