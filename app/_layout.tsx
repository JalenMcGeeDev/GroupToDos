import '../global.css';
import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, Image, AppState, AppStateStatus } from 'react-native';
import { Slot, useRouter, useSegments, usePathname, useNavigationContainerRef } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Updates from 'expo-updates';
import { isRunningInExpoGo } from 'expo';
import * as Sentry from '@sentry/react-native';

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

Sentry.init({
  dsn: 'https://2cfcea0800662174165c00c47e3defec@o4511315428835328.ingest.us.sentry.io/4511315430735872',
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2,
  integrations: [navigationIntegration],
  enableNativeFramesTracking: !isRunningInExpoGo(),
});
import { useAuthStore } from '../stores/auth-store';
import { AlertProvider } from '../components/AlertProvider';
import { CelebrationOverlay } from '../components/CelebrationOverlay';
import { PersistentTabBar } from '../components/PersistentTabBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { usePushNotifications } from '../hooks/use-push-notifications';
import posthog from '../lib/posthog';

function getScreenName(segments: string[]): string {
  const [s0, s1, s2, s3] = segments;
  if (s0 === '(auth)') {
    if (s1 === 'login') return 'Login';
    if (s1 === 'onboarding') return 'Onboarding';
    if (s1 === 'verify') return 'Verify OTP';
  }
  if (s0 === '(tabs)') {
    if (s1 === 'groups' || s1 === undefined) return 'Groups';
    if (s1 === 'index') return 'My Goals';
    if (s1 === 'profile') return 'Profile';
  }
  if (s0 === 'goal') {
    if (s1 === 'create') return 'Create Goal';
    if (s1 === '[goalId]') return 'Goal Detail';
  }
  if (s0 === 'group') {
    if (s2 === 'goal') {
      if (s3 === 'create') return 'Create Goal (Group)';
      if (s3 === '[goalId]') return 'Goal Detail (Group)';
    }
    return 'Group Detail';
  }
  if (s0 === 'create-group') return 'Create Group';
  if (s0 === 'join-group') return 'Join Group';
  if (s0 === 'log-action') return 'Log Action';
  if (s0 === 'pending-invites') return 'Pending Invites';
  if (s0 === 'check-in') return 'Check In';
  return 'Unknown';
}

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
  const pathname = usePathname();
  const router = useRouter();
  const opacity = useRef(new Animated.Value(1)).current;
  const [showSplash, setShowSplash] = useState(true);
  // Tracks whether the one-time cold-start redirect (tabs → groups) has already fired.
  // Without this, every tap on the Goals (index) tab gets bounced back to groups.
  const hasInitialRedirected = useRef(false);

  // Register for push notifications when authenticated
  usePushNotifications();

  useEffect(() => {
    if (!initialized || segments.length === 0) return;
    const screenName = getScreenName(segments as string[]);
    posthog.screen(screenName, { path: pathname });
  }, [pathname]);

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
    } else if (profile !== null && !profile.onboarding_completed) {
      // Signed in but hasn't completed onboarding.
      // Guard: if profile is still null (loading), don't route — wait for it to arrive.
      if (segments[1] !== 'onboarding') {
        console.log('[AuthGate] → replacing with onboarding');
        router.replace('/(auth)/onboarding');
      }
    } else {
      // Redirect to groups if coming from auth screens or on the initial empty route.
      // The onTabsIndex check only fires once (cold-start Expo Router restoring to index)
      // — after that, tapping the Goals tab is intentional and should not redirect.
      const onTabsIndex = segments[0] === '(tabs)' && (segments[1] === 'index' || segments[1] === undefined);
      const shouldRedirectToGroups =
        inAuthGroup ||
        segments.length === 0 ||
        (onTabsIndex && !hasInitialRedirected.current);

      if (shouldRedirectToGroups) {
        hasInitialRedirected.current = true;
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
    const destinedForOnboarding = !!session && profile !== null && !profile.onboarding_completed;

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
  const onCheckIn = segments.includes('check-in');
  const showTabBar = initialized && !!session && !inAuthGroup && !onGoalCreate && !onGoalDetail && !onGroupScreen && !onCheckIn;

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

function RootLayout() {
  const ref = useNavigationContainerRef();
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    if (ref) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

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

export default Sentry.wrap(RootLayout);
