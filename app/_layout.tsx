import '../global.css';
import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../stores/auth-store';
import { AlertProvider } from '../components/AlertProvider';
import { CelebrationOverlay } from '../components/CelebrationOverlay';
import { PersistentTabBar } from '../components/PersistentTabBar';
import { usePushNotifications } from '../hooks/use-push-notifications';
import { COLORS } from '../constants';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 2,
    },
  },
});

function AuthGate() {
  const { session, profile, initialized } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // Register for push notifications when authenticated
  usePushNotifications();

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Not signed in — go to login
      router.replace('/(auth)/login');
    } else if (session && !profile?.onboarding_completed && segments[1] !== 'onboarding') {
      // Signed in but hasn't picked a username yet
      router.replace('/(auth)/onboarding');
    } else if (session && profile?.onboarding_completed && inAuthGroup) {
      // Fully onboarded — go to tabs
      router.replace('/(tabs)');
    }
  }, [session, profile, initialized, segments]);

  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const inAuthGroup = segments[0] === '(auth)';
  const showTabBar = !!session && !inAuthGroup;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      {showTabBar && <PersistentTabBar />}
    </View>
  );
}

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AlertProvider>
          <StatusBar style="dark" />
          <AuthGate />
          <CelebrationOverlay />
        </AlertProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
