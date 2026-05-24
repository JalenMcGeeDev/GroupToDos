import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';

/**
 * Fetches the current user's last-viewed timestamps for a set of goals.
 * Returns a stable Record<goalId, viewed_at_iso_string>.
 *
 * Uses a sorted, joined key so the query only re-runs when the actual
 * set of goal IDs changes — not on every render.
 */
export function useGoalViews(goalIds: string[]) {
  const user = useAuthStore((s) => s.user);
  // Stable cache key: sorted IDs joined as a string
  const sortedKey = [...goalIds].sort().join(',');

  return useQuery({
    queryKey: ['goal-views', user?.id, sortedKey],
    queryFn: async (): Promise<Record<string, string>> => {
      if (!goalIds.length || !user) return {};
      const { data, error } = await supabase
        .from('goal_views')
        .select('goal_id, viewed_at')
        .eq('user_id', user.id)
        .in('goal_id', goalIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        map[row.goal_id] = row.viewed_at;
      }
      return map;
    },
    enabled: !!user && goalIds.length > 0,
    // Views don't need to be super fresh — refetch after 60s of background time
    staleTime: 60_000,
  });
}

/**
 * Upserts a view record for the current user + goal.
 * Call this when a non-owner opens a goal detail screen.
 * Invalidates the goal-views cache so the dot disappears immediately.
 */
export function useMarkGoalViewed() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async (goalId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from('goal_views')
        .upsert(
          { user_id: user.id, goal_id: goalId, viewed_at: new Date().toISOString() },
          { onConflict: 'user_id,goal_id' },
        );
      if (error) throw error;
    },
    onError: (error) => { Sentry.captureException(error, { tags: { mutation: 'markGoalViewed' } }); },
    onSuccess: () => {
      // Invalidate all goal-views queries so cards refresh immediately
      queryClient.invalidateQueries({ queryKey: ['goal-views'] });
    },
  });
}
