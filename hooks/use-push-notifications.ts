import { useEffect, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import { useNotificationStore } from '../stores/notification-store';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  // Get the Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      ...(projectId ? { projectId } : {}),
    });
    return tokenData.data;
  } catch (e) {
    console.warn('Failed to get push token:', e);
    Sentry.captureException(e, { tags: { context: 'getPushToken' } });
    return null;
  }
}

async function upsertPushToken(userId: string, token: string) {
  const platform = Platform.OS; // 'ios' | 'android' | 'web'

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' }
    );

  if (error) {
    console.warn('Failed to upsert push token:', error.message);
    Sentry.captureException(new Error(`upsertPushToken: ${error.message}`), { tags: { context: 'pushToken' } });
  }
}

export function usePushNotifications() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    if (!user) return;

    // Register and store push token on mount
    registerForPushNotificationsAsync().then((token) => {
      if (token) upsertPushToken(user.id, token);
    });

    // Re-register when app returns to foreground (handles re-enabling notifications in Settings)
    // Also removes stale tokens when permission has been revoked
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') {
        const token = await registerForPushNotificationsAsync();
        if (token) upsertPushToken(user.id, token);
      } else {
        // Permission revoked in Settings — remove stale tokens so pushes stop
        await supabase.from('push_tokens').delete().eq('user_id', user.id);
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    // Listen for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      try {
        const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
        const type = typeof data.type === 'string' ? data.type : 'teammate_action';
        Sentry.addBreadcrumb({ category: 'push', message: `Notification received: ${type}`, level: 'info', data: { type } });
        addNotification({
          id: notification.request.identifier,
          user_id: user.id,
          type,
          title: notification.request.content.title ?? '',
          body: notification.request.content.body ?? null,
          data,
          read: false,
          created_at: new Date().toISOString(),
        } as any);
      } catch (e) {
        console.warn('Failed to handle received notification:', e);
        Sentry.captureException(e, { tags: { context: 'notificationReceived' } });
      }
    });

    // Listen for notification taps (user presses the notification)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
        const type = typeof data.type === 'string' ? data.type : 'unknown';
        Sentry.addBreadcrumb({ category: 'push', message: `Notification tapped: ${type}`, level: 'info', data: { type } });
        const groupId = typeof data.group_id === 'string' ? data.group_id : null;
        const goalId = typeof data.goal_id === 'string' ? data.goal_id : null;
        if (type === 'checkin_reminder') {
          router.push('/check-in' as any);
          return;
        }
        if (type === 'group_invite') {
          router.push('/pending-invites' as any);
          return;
        }
        if (groupId) {
          router.push({
            pathname: `/group/${groupId}` as any,
            params: goalId ? { expandGoal: goalId } : undefined,
          });
        } else if (goalId) {
          router.push({ pathname: '/goal/[goalId]' as any, params: { goalId } });
        }
      } catch (e) {
        console.warn('Failed to handle notification tap:', e);
        Sentry.captureException(e, { tags: { context: 'notificationTap' } });
      }
    });

    return () => {
      appStateSub.remove();
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [user?.id]);
}
