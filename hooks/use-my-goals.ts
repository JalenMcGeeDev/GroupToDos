import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import type { Goal, GoalGroupShare, Group } from '../lib/types';
import { writeGoalsCache, type WidgetGoal } from '../widget/widget-data';
import { triggerAllWidgetUpdates } from '../widget/trigger-update';

/** Fetch ALL goals created by the current user (personal + group-linked). */
export function useMyGoals() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['my-goals', user?.id],
    queryFn: async (): Promise<Goal[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('goals')
        .select('*, creator_profile:profiles!goals_created_by_fkey(*), sub_goals:sub_goals(*), group:groups!goals_group_id_fkey(name)')
        .eq('created_by', user.id)
        .order('updated_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      const goals = (data as Goal[]) ?? [];

      // Keep the Android widget in sync — fire-and-forget, never blocks the query
      const widgetGoals: WidgetGoal[] = goals
        .filter((g) => g.status === 'active')
        .map((g) => ({
          id: g.id,
          title: g.title,
          due_date: g.end_date ?? null,
          sub_goals: (g.sub_goals ?? []).map((sg) => ({
            id: sg.id,
            title: sg.title,
            status: sg.status,
            due_date: sg.due_date ?? null,
          })),
        }));
      writeGoalsCache(widgetGoals).then(() => triggerAllWidgetUpdates(widgetGoals)).catch(() => {});

      return goals;
    },
    enabled: !!user,
  });
}

/** Fetch which groups a goal is shared to. */
export function useGoalShares(goalId: string) {
  return useQuery({
    queryKey: ['goal-shares', goalId],
    queryFn: async (): Promise<(GoalGroupShare & { group: Group })[]> => {
      const { data, error } = await supabase
        .from('goal_group_shares')
        .select('*, group:groups(*)')
        .eq('goal_id', goalId);

      if (error) throw error;
      return (data ?? []) as (GoalGroupShare & { group: Group })[];
    },
    enabled: !!goalId,
  });
}

/** Share a goal to a group. */
export function useShareGoalToGroup() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({ goalId, groupId }: { goalId: string; groupId: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('goal_group_shares')
        .insert({
          goal_id: goalId,
          group_id: groupId,
          shared_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as GoalGroupShare;
    },
    onError: (error) => { Sentry.captureException(error, { tags: { mutation: 'shareGoalToGroup' } }); },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['goal-shares', variables.goalId] });
      queryClient.invalidateQueries({ queryKey: ['goals', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

/** Unshare a goal from a group. */
export function useUnshareGoalFromGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ goalId, groupId }: { goalId: string; groupId: string }) => {
      const { error } = await supabase
        .from('goal_group_shares')
        .delete()
        .eq('goal_id', goalId)
        .eq('group_id', groupId);

      if (error) throw error;
    },
    onError: (error) => { Sentry.captureException(error, { tags: { mutation: 'unshareGoalFromGroup' } }); },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['goal-shares', variables.goalId] });
      queryClient.invalidateQueries({ queryKey: ['goals', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}
