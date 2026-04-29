import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import type { Profile } from '../lib/types';

// ─── Types ──────────────────────────────────────────────────

export interface AggregatedReaction {
  reaction_type: string;
  count: number;
  users: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[];
  reacted_by_me: boolean;
}

export interface RawReactionItem {
  id: string;
  user_id: string;
  reaction_type: string;
  created_at: string;
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
  isOwn: boolean;
}

interface RawReaction {
  id: string;
  goal_id: string;
  user_id: string;
  reaction_type: string;
  created_at: string;
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
}

// ─── Fetch reactions for a goal ─────────────────────────────

export function useGoalReactions(goalId: string, enabled = true) {
  const currentUser = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['reactions', goalId],
    enabled: !!goalId && enabled,
    queryFn: async (): Promise<AggregatedReaction[]> => {
      const { data, error } = await supabase
        .from('goal_reactions')
        .select('id, goal_id, user_id, reaction_type, created_at, profile:profiles!goal_reactions_user_id_fkey(id, display_name, avatar_url)')
        .eq('goal_id', goalId)
        .order('created_at', { ascending: true })
        .limit(500);

      if (error) throw error;

      const raw = (data ?? []) as unknown as RawReaction[];

      // Group by reaction_type
      const grouped = new Map<string, AggregatedReaction>();

      for (const r of raw) {
        const existing = grouped.get(r.reaction_type);
        if (existing) {
          existing.count++;
          existing.users.push(r.profile);
          if (r.user_id === currentUser?.id) existing.reacted_by_me = true;
        } else {
          grouped.set(r.reaction_type, {
            reaction_type: r.reaction_type,
            count: 1,
            users: [r.profile],
            reacted_by_me: r.user_id === currentUser?.id,
          });
        }
      }

      return Array.from(grouped.values());
    },
  });
}

// ─── Fetch individual (non-aggregated) reactions ─────────────

export function useGoalRawReactions(goalId: string, enabled = true) {
  const currentUser = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['reactions-raw', goalId],
    enabled: !!goalId && enabled,
    queryFn: async (): Promise<RawReactionItem[]> => {
      const { data, error } = await supabase
        .from('goal_reactions')
        .select('id, user_id, reaction_type, created_at, profile:profiles!goal_reactions_user_id_fkey(id, display_name, avatar_url)')
        .eq('goal_id', goalId)
        .order('created_at', { ascending: true })
        .limit(500);

      if (error) throw error;
      const raw = (data ?? []) as unknown as (Omit<RawReactionItem, 'isOwn'>)[];
      return raw.map((r) => ({ ...r, isOwn: r.user_id === currentUser?.id }));
    },
  });
}

// ─── Add a reaction ─────────────────────────────────────────

export function useAddReaction() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({
      goalId,
      reactionType,
    }: {
      goalId: string;
      reactionType: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('goal_reactions')
        .insert({
          goal_id: goalId,
          user_id: user.id,
          reaction_type: reactionType,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reactions', variables.goalId] });
      queryClient.invalidateQueries({ queryKey: ['reactions-raw', variables.goalId] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    },
  });
}

// ─── Remove a reaction ──────────────────────────────────────

export function useRemoveReaction() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({
      goalId,
      reactionType,
    }: {
      goalId: string;
      reactionType: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('goal_reactions')
        .delete()
        .eq('goal_id', goalId)
        .eq('user_id', user.id)
        .eq('reaction_type', reactionType);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reactions', variables.goalId] });
      queryClient.invalidateQueries({ queryKey: ['reactions-raw', variables.goalId] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    },
  });
}

// ─── Toggle a reaction (add if not present, remove if already reacted) ──

export function useToggleReaction() {
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();

  return {
    mutate: ({
      goalId,
      reactionType,
      isReacted,
    }: {
      goalId: string;
      reactionType: string;
      isReacted: boolean;
    }) => {
      if (isReacted) {
        removeReaction.mutate({ goalId, reactionType });
      } else {
        addReaction.mutate({ goalId, reactionType });
      }
    },
    isPending: addReaction.isPending || removeReaction.isPending,
  };
}
