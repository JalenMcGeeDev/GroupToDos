import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import type { Comment } from '../lib/types';

// ─── Fetch comments for a goal ───────────────────────────────

export function useGoalComments(goalId: string, enabled = true) {
  return useQuery({
    queryKey: ['comments', goalId],
    enabled: !!goalId && enabled,
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('comments')
        .select('id, user_id, target_type, target_id, body, voice_url, created_at, profile:profiles!comments_user_id_fkey(id, display_name, avatar_url)')
        .eq('target_type', 'goal')
        .eq('target_id', goalId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as Comment[];
    },
  });
}

// ─── Add a comment ───────────────────────────────────────────

export function useAddGoalComment() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({ goalId, body }: { goalId: string; body: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('comments').insert({
        user_id: user.id,
        target_type: 'goal',
        target_id: goalId,
        body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: (_, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', goalId] });
    },
  });
}

// ─── Add a voice note comment ─────────────────────────────────

export function useAddVoiceNoteComment() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({ goalId, voiceUrl }: { goalId: string; voiceUrl: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('comments').insert({
        user_id: user.id,
        target_type: 'goal',
        target_id: goalId,
        voice_url: voiceUrl,
      });
      if (error) throw error;
    },
    onSuccess: (_, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', goalId] });
    },
  });
}

// ─── Delete a comment ────────────────────────────────────────

export function useDeleteGoalComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId }: { commentId: string; goalId: string }) => {
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) throw error;
    },
    onSuccess: (_, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', goalId] });
    },
  });
}
