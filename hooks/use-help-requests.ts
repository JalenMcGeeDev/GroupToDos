import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import type { HelpRequest } from '../lib/types';

/**
 * Fetch the active (unresolved) help request for a goal.
 * Returns null if there's no active request.
 */
export function useHelpRequests(goalId: string | undefined) {
  return useQuery({
    queryKey: ['help-requests', goalId],
    queryFn: async (): Promise<HelpRequest | null> => {
      if (!goalId) return null;

      const { data, error } = await supabase
        .from('help_requests')
        .select('*, requester_profile:profiles!help_requests_requested_by_fkey(*)')
        .eq('goal_id', goalId)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      return (data?.[0] as HelpRequest) ?? null;
    },
    enabled: !!goalId,
  });
}

export function useAskForHelp() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({
      goalId,
      groupId,
      note,
    }: {
      goalId: string;
      groupId: string;
      note: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('help_requests')
        .insert({
          goal_id: goalId,
          requested_by: user.id,
          group_id: groupId,
          note,
        })
        .select()
        .single();

      if (error) throw error;
      return data as HelpRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-requests'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    },
  });
}

export function useResolveHelp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (helpRequestId: string) => {
      const { data, error } = await supabase
        .from('help_requests')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', helpRequestId)
        .select()
        .single();

      if (error) throw error;
      return data as HelpRequest;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['help-requests'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    },
  });
}
