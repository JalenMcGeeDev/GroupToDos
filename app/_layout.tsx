import '../global.css';
import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, Image, AppState, AppStateStatus } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Updates from 'expo-updates';
import { useAuthStore } from '../stores/auth-store';
import { AlertProvider } from '../components/AlertProvider';
import { CelebrationOverlay } from '../components/CelebrationOverlay';
import { PersistentTabBar } from '../components/PersistentTabBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { usePushNotifications } from '../hooks/use-push-notifications';

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
  const opacity = useRef(new Animated.Value(1)).current;
  const [showSplash, setShowSplash] = useState(true);

  // Register for push notifications when authenticated
  usePushNotifications();

  // Navigation logic
  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    console.log('[AuthGate] nav effect:', {
      segments,
      inAuthGroup,
      hasSession: !!session,
      onboardingCompleted: profile?.onboarding_completed,
    });

    if (!session) {
      // Not signed in — go to login
      if (!inAuthGroup) {
        console.log('[AuthGate] → replacing with login');
        router.replace('/(auth)/login');
      }
    } else if (!profile?.onboarding_completed) {
      // Signed in but hasn't completed onboarding
      if (segments[1] !== 'onboarding') {
        console.log('[AuthGate] → replacing with onboarding');
        router.replace('/(auth)/onboarding');
      }
    } else {
      // Fully authenticated — redirect to tabs if stuck in auth screens or on initial empty route
      if (inAuthGroup || segments.length === 0) {
        console.log('[AuthGate] → replacing with groups tab');
        router.replace('/(tabs)/groups');
      }
    }
  }, [session, profile?.onboarding_completed, initialized, segments]);

  // Fade out the splash overlay only once the correct destination screen is rendered.
  // Waiting for `initialized` alone causes a flash because router.replace() is async —
  // the old screen is visible during the fade. Instead we wait until segments
  // reflect the right place: tabs (authed) or auth screens (not authed).
  useEffect(() => {
    if (!initialized) return;
    if (segments.length === 0) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';
    const inAppGroup = segments[0] === 'group' || segments[0] === 'goal';

    const destinedForAuth = !session;
    const destinedForTabs = !!session && !!profile?.onboarding_completed;
    const destinedForOnboarding = !!session && !profile?.onboarding_completed;

    const atCorrectScreen =
      (destinedForAuth && inAuthGroup && segments[1] !== 'onboarding') ||
      (destinedForOnboarding && segments[1] === 'onboarding') ||
      (destinedForTabs && (inTabsGroup || inAppGroup));

    if (!atCorrectScreen) return;

    Animated.timing(opacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setShowSplash(false));
  }, [initialized, segments, session, profile?.onboarding_completed]);

  const inAuthGroup = segments[0] === '(auth)';
  const onGoalCreate = segments.includes('create') && segments.includes('goal');
  const onGoalDetail = segments.includes('goal') && !onGoalCreate;
  const onGroupScreen = segments[0] === 'group';
  const showTabBar = initialized && !!session && !inAuthGroup && !onGoalCreate && !onGoalDetail && !onGroupScreen;

  return (
    <View style={{ flex: 1, backgroundColor: '#F7F5F2' }}>
      <Slot />
      {showTabBar && <PersistentTabBar />}
      {showSplash && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#F7F5F2',
            alignItems: 'center',
            justifyContent: 'center',
            opacity,
          }}
          pointerEvents="none"
        >
          <View style={{ width: 160, height: 160, borderRadius: 36, overflow: 'hidden' }}>
            <Image
              source={require('../assets/splash-icon.png')}
              style={{ width: 160, height: 160 }}
              resizeMode="cover"
            />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, []);

  // Check for OTA updates when the app returns to the foreground.
  // expo-updates already checks on cold launch; this catches long-lived sessions.
  useEffect(() => {
    if (!Updates.isEnabled) return;

    const checkForUpdate = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Silent — never block the app on update check failures
      }
    };

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        checkForUpdate();
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AlertProvider>
            <StatusBar style="dark" />
            <AuthGate />
            <CelebrationOverlay />
          </AlertProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
