import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import * as Sentry from '@sentry/react-native';
import posthog from '../lib/posthog';
import type { HelpOffer } from '../lib/types';

/**
 * Fetch help offers for a goal.
 * Returns an array of HelpOffer[].
 */
export function useHelpOffers(goalId: string | undefined) {
  return useQuery({
    queryKey: ['help-offers', goalId],
    queryFn: async (): Promise<HelpOffer[]> => {
      if (!goalId) return [];

      const { data, error } = await supabase
        .from('help_offers')
        .select('*, offerer_profile:profiles!help_offers_offered_by_fkey(*), group:groups(id,name)')
        .eq('goal_id', goalId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as HelpOffer[]) ?? [];
    },
    enabled: !!goalId,
  });
}

export function useOfferHelp() {
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
        .from('help_offers')
        .insert({
          goal_id: goalId,
          offered_by: user.id,
          group_id: groupId,
          note,
        })
        .select()
        .single();

      if (error) throw error;

      // Notify the goal owner (best effort, non-blocking)
      try {
        const [{ data: goal }, { data: offererProfile }] = await Promise.all([
          supabase.from('goals').select('created_by, title').eq('id', goalId).single(),
          supabase.from('profiles').select('display_name').eq('id', user.id).single(),
        ]);

        if (goal && goal.created_by !== user.id) {
          const offererName = offererProfile?.display_name ?? 'Someone';
          await supabase.functions.invoke('send-push', {
            body: {
              user_id: goal.created_by,
              title: `${offererName} offered to help!`,
              body: `"${goal.title}" - tap to review their offer`,
              data: { type: 'help_offered', goal_id: goalId, group_id: groupId },
            },
          });
        }
      } catch (e) {
        console.warn('Failed to send help offer push:', e);
        Sentry.addBreadcrumb({ category: 'push', message: 'send-push edge function failed (help offer)', level: 'warning', data: { goalId } });
      }

      return data as HelpOffer;
    },
    onError: (error) => { Sentry.captureException(error, { tags: { mutation: 'offerHelp' } }); },
    onSuccess: (_, variables) => {
      posthog.capture('help_offered', { goal_id: variables.goalId, group_id: variables.groupId });
      queryClient.invalidateQueries({ queryKey: ['help-offers'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    },
  });
}

export function useDeleteHelpOffer() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async (offerId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('help_offers')
        .delete()
        .eq('id', offerId)
        .eq('offered_by', user.id); // enforce ownership server-side

      if (error) throw error;
    },
    onError: (error) => { Sentry.captureException(error, { tags: { mutation: 'deleteHelpOffer' } }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-offers'] });
    },
  });
}
