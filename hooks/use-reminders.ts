import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';

export interface ScheduledReminder {
  id: string;
  user_id: string;
  goal_id: string;
  sub_goal_id: string | null;
  notification_id: string;
  remind_at: string;
  created_at: string;
}

export function useGoalReminders(goalId: string) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['reminders', goalId],
    queryFn: async (): Promise<ScheduledReminder[]> => {
      const { data, error } = await supabase
        .from('scheduled_reminders')
        .select('*')
        .eq('goal_id', goalId)
        .eq('user_id', user!.id)
        .order('remind_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScheduledReminder[];
    },
    enabled: !!goalId && !!user,
  });
}

export function useAddReminder() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({ goalId, remindAt }: { goalId: string; remindAt: Date }) => {
      // Schedule a local notification
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Goal Reminder',
          body: 'You have a reminder for one of your goals.',
          data: { goalId, type: 'goal_reminder' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: remindAt,
        },
      });

      // Persist to Supabase
      const { data, error } = await supabase
        .from('scheduled_reminders')
        .insert({
          user_id: user!.id,
          goal_id: goalId,
          notification_id: notificationId,
          remind_at: remindAt.toISOString(),
        })
        .select()
        .single();

      if (error) {
        // Roll back the scheduled notification if the DB insert fails
        await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {});
        throw error;
      }

      return data as ScheduledReminder;
    },
    onSuccess: (_, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: ['reminders', goalId] });
    },
    onError: (err) => {
      Sentry.captureException(err, { tags: { context: 'addReminder' } });
    },
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reminder }: { reminder: ScheduledReminder }) => {
      // Cancel the local notification
      await Notifications.cancelScheduledNotificationAsync(reminder.notification_id).catch(() => {});

      // Delete from Supabase
      const { error } = await supabase
        .from('scheduled_reminders')
        .delete()
        .eq('id', reminder.id);
      if (error) throw error;
    },
    onSuccess: (_, { reminder }) => {
      queryClient.invalidateQueries({ queryKey: ['reminders', reminder.goal_id] });
    },
    onError: (err) => {
      Sentry.captureException(err, { tags: { context: 'deleteReminder' } });
    },
  });
}
