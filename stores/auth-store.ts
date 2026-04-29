import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  fetchProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  initialized: false,

  initialize: async () => {
    // Set up the listener FIRST — Supabase fires INITIAL_SESSION immediately,
    // which gives us the persisted session without a race condition.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        set({ session, user: session?.user ?? null });

        if (session?.user) {
          await get().fetchProfile();
        } else {
          set({ profile: null });
        }

        if (!get().initialized) {
          set({ initialized: true, isLoading: false });
        }
      }
    );

    // No fallback needed — Supabase v2 always fires INITIAL_SESSION via
    // onAuthStateChange synchronously, so the listener above handles all cases.
  },

  setSession: (session) => {
    set({ session, user: session?.user ?? null });
  },

  setProfile: (profile) => {
    set({ profile });
  },

  fetchProfile: async () => {
    const user = get().user;
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.warn('fetchProfile failed:', error.message);
      return;
    }
    if (data) {
      set({ profile: data as Profile });
    }
  },

  updateProfile: async (updates) => {
    const user = get().user;
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      console.warn('updateProfile failed:', error.message);
      throw error;
    }
    if (data) {
      set({ profile: data as Profile });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  },
}));
