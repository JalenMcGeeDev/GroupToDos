import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import type { Session, User } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import posthog from '../lib/posthog';
import { triggerStreakWidgetUpdate } from '../widget/trigger-update';

const WIDGET_SESSION_KEY = 'cogo_widget_session';

function persistWidgetSession(session: Session | null) {
  if (session) {
    AsyncStorage.setItem(
      WIDGET_SESSION_KEY,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user_id: session.user.id,
      })
    ).catch(() => {});
  } else {
    AsyncStorage.removeItem(WIDGET_SESSION_KEY).catch(() => {});
  }
}

function triggerWidgetRefresh() {
  if (Platform.OS !== 'android') return;
  try {
    // Dynamic require keeps this module out of the iOS bundle
    const { requestWidgetUpdate } = require('react-native-android-widget');
    const { MyGoalsWidget } = require('../widget/MyGoalsWidget');
    const { StreakTrackerWidget } = require('../widget/StreakTrackerWidget');
    const React = require('react');
    const noop = () => {};
    requestWidgetUpdate({ widgetName: 'MyGoalsWidget', renderWidget: () => React.createElement(MyGoalsWidget, { goals: [], loading: true }), widgetNotFound: noop });
    requestWidgetUpdate({ widgetName: 'StreakTrackerWidget', renderWidget: () => React.createElement(StreakTrackerWidget, { streak_current: 0, streak_longest: 0, loading: true }), widgetNotFound: noop });
  } catch {
    // Widget module not available or not on Android
  }
}

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

        persistWidgetSession(session);
        triggerWidgetRefresh();

        if (!session?.user) {
          set({ profile: null });
        }

        // Unblock navigation immediately — don't wait on the DB call.
        // Without this, a slow/hanging fetchProfile keeps initialized=false forever
        // and the splash screen never fades (the stall bug).
        if (!get().initialized) {
          set({ initialized: true, isLoading: false });
        }

        // Profile loads in the background; nav effect re-runs when it arrives.
        if (session?.user) {
          get().fetchProfile();
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
      Sentry.captureException(new Error(`fetchProfile: ${error.message}`));
      return;
    }
    if (data) {
      set({ profile: data as Profile });
      Sentry.setUser({ id: user.id });
      posthog.identify(user.id, {
        display_name: (data as Profile).display_name,
        streak_current: (data as Profile).streak_current,
      });
      // Push latest streak to the widget without blocking
      triggerStreakWidgetUpdate({
        streak_current: (data as Profile).streak_current ?? 0,
        streak_longest: (data as Profile).streak_longest ?? 0,
        last_action_date: (data as Profile).last_action_date ?? null,
      }).catch(() => {});
      // Silently sync device timezone so daily-reminders fire at 9am local time
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if ((data as Profile).timezone !== tz) {
        supabase.from('profiles').update({ timezone: tz }).eq('id', user.id).then(() => {});
      }
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
      Sentry.captureException(new Error(`updateProfile: ${error.message}`));
      throw error;
    }
    if (data) {
      set({ profile: data as Profile });
      posthog.capture('profile_updated', { fields: Object.keys(updates) });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    Sentry.setUser(null);
    posthog.reset();
    set({ session: null, user: null, profile: null });
  },
}));
