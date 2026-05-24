import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import posthog from '../lib/posthog';
import type { Goal, SubGoal, DailyIntention } from '../lib/types';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getToday(): string {
  return toISODate(new Date());
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

// ---------------------------------------------------------------------------
// useYesterdaysIntention
// ---------------------------------------------------------------------------

export function useYesterdaysIntention() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['intention', 'yesterday', user?.id],
    queryFn: async (): Promise<DailyIntention | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('daily_intentions')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', getYesterday())
        .maybeSingle();
      if (error) throw error;
      return (data as DailyIntention) ?? null;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 30, // 30 min — yesterday's intention won't change
  });
}

// ---------------------------------------------------------------------------
// useTodaysIntention — for pre-filling if the screen is re-opened
// ---------------------------------------------------------------------------

export function useTodaysIntention() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['intention', 'today', user?.id],
    queryFn: async (): Promise<DailyIntention | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('daily_intentions')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', getToday())
        .maybeSingle();
      if (error) throw error;
      return (data as DailyIntention) ?? null;
    },
    enabled: !!user,
    staleTime: 0, // Always re-check on mount
  });
}

// ---------------------------------------------------------------------------
// useSaveIntention — UPSERT on (user_id, date); uploads media first if present
// ---------------------------------------------------------------------------

export type IntentionMediaType = 'video' | 'voice' | 'text';

export function useSaveIntention() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({
      text,
      localUri,
      mediaType,
      shareWithGroups,
    }: {
      text: string | null;
      localUri: string | null;   // local file path for video/voice (will be uploaded)
      mediaType: IntentionMediaType;
      shareWithGroups: boolean;
    }) => {
      if (!user) throw new Error('Not authenticated');

      // Upload media file to Supabase Storage if present
      let uploadedPath: string | null = null;
      if (localUri && mediaType !== 'text') {
        const ext = mediaType === 'video' ? 'mp4' : 'm4a';
        const storagePath = `${user.id}/${Date.now()}.${ext}`;
        const contentType = mediaType === 'video' ? 'video/mp4' : 'audio/m4a';
        const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });

        const { error: uploadError } = await supabase.storage
          .from('intention-media')
          .upload(storagePath, decode(base64), { contentType });
        if (uploadError) throw uploadError;
        uploadedPath = storagePath;
      }

      const today = getToday();
      const { data, error } = await supabase
        .from('daily_intentions')
        .upsert(
          {
            user_id: user.id,
            date: today,
            text: text?.trim() || null,
            media_url: uploadedPath,
            media_type: mediaType,
            share_with_groups: shareWithGroups,
          },
          { onConflict: 'user_id,date' }
        )
        .select()
        .single();
      if (error) throw error;
      return data as DailyIntention;
    },
    onError: (error) => {
      Sentry.captureException(error, { tags: { mutation: 'saveIntention' } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intention', 'today'] });
    },
  });
}

// ---------------------------------------------------------------------------
// useActiveGoalsWithSubGoals — all active goals the user created, with
// non-completed sub-goals included
// ---------------------------------------------------------------------------

export interface GoalForCheckin extends Goal {
  sub_goals: SubGoal[];
}

export function useActiveGoalsWithSubGoals() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['checkin-goals', user?.id],
    queryFn: async (): Promise<GoalForCheckin[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('goals')
        .select('*, sub_goals:sub_goals(*)')
        .eq('created_by', user.id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data as GoalForCheckin[]) ?? [];
    },
    enabled: !!user,
    staleTime: 0,
  });
}

// ---------------------------------------------------------------------------
// useLogCheckinActions — batch INSERT action_logs + UPDATE sub_goals status
// ---------------------------------------------------------------------------

export function useLogCheckinActions() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async (subGoalIds: string[]) => {
      if (!user) throw new Error('Not authenticated');
      if (subGoalIds.length === 0) return;

      // Insert one action_log per checked sub-goal
      const logs = subGoalIds.map((sub_goal_id) => ({
        user_id: user.id,
        sub_goal_id,
        note: null,
        media_url: null,
        value: 1,
      }));

      const { error: logError } = await supabase.from('action_logs').insert(logs);
      if (logError) throw logError;

      // Mark each sub-goal as completed
      const { error: sgError } = await supabase
        .from('sub_goals')
        .update({ status: 'completed' })
        .in('id', subGoalIds);
      if (sgError) throw sgError;
    },
    onError: (error) => {
      Sentry.captureException(error, { tags: { mutation: 'logCheckinActions' } });
    },
    onSuccess: (_, subGoalIds) => {
      posthog.capture('checkin_completed', { sub_goal_count: subGoalIds.length });
      queryClient.invalidateQueries({ queryKey: ['goals'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['goal'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['my-goals'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['checkin-goals'], refetchType: 'active' });
      useAuthStore.getState().fetchProfile();
    },
  });
}

// ---------------------------------------------------------------------------
// useShareIntention — insert group_activities + send-group-push per group
// ---------------------------------------------------------------------------

export function useShareIntention() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  return useMutation({
    mutationFn: async ({
      intentionText,
      groupIds,
    }: {
      intentionText: string;
      groupIds: string[];
    }) => {
      if (!user || !profile || groupIds.length === 0) return;

      const displayName = profile.display_name ?? 'Someone';
      const title = `${displayName} shared an intention`;

      // Insert one group_activities row per group
      const activities = groupIds.map((group_id) => ({
        group_id,
        user_id: user.id,
        type: 'intention_shared',
        goal_id: null,
        sub_goal_id: null,
        metadata: { intention_text: intentionText, title },
      }));

      const { error: actError } = await supabase.from('group_activities').insert(activities);
      if (actError) {
        Sentry.captureException(actError, { tags: { context: 'shareIntention.insert' } });
        // Non-fatal — continue to push
      }

      // Notify other group members for each group
      await Promise.allSettled(
        groupIds.map((group_id) =>
          supabase.functions.invoke('send-group-push', {
            body: {
              group_id,
              exclude_user_id: user.id,
              title: `${displayName} shared their intention 💭`,
              body: intentionText.length > 80 ? intentionText.slice(0, 77) + '…' : intentionText,
              data: { type: 'intention_shared', group_id },
            },
          })
        )
      );
    },
    onError: (error) => {
      Sentry.captureException(error, { tags: { mutation: 'shareIntention' } });
    },
  });
}

// ---------------------------------------------------------------------------
// useCheckinInsight — compute stats for the insight step
// ---------------------------------------------------------------------------

export interface CheckinInsight {
  checkinsThisWeek: number;
  activeGoalCount: number;
  avgProgress: number; // 0–100
}

export function useCheckinInsight(activeGoals: GoalForCheckin[]) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['checkin-insight', user?.id],
    queryFn: async (): Promise<CheckinInsight> => {
      if (!user) return { checkinsThisWeek: 0, activeGoalCount: 0, avgProgress: 0 };

      // Start of this week (Monday)
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - daysFromMonday);
      monday.setHours(0, 0, 0, 0);

      const { count, error } = await supabase
        .from('action_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', monday.toISOString());

      if (error) throw error;

      const activeGoalCount = activeGoals.length;
      const avgProgress =
        activeGoalCount > 0
          ? activeGoals.reduce((sum, g) => sum + (g.progress ?? 0), 0) / activeGoalCount
          : 0;

      return {
        checkinsThisWeek: count ?? 0,
        activeGoalCount,
        avgProgress: Math.round(avgProgress),
      };
    },
    enabled: !!user,
    staleTime: 0,
  });
}
