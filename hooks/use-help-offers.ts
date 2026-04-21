import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
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
        .select('*, offerer_profile:profiles!help_offers_offered_by_fkey(*)')
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
      return data as HelpOffer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-offers'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    },
  });
}
