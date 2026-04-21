import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import type { FeedItem, Comment } from '../lib/types';

export function useActivityFeed(groupId: string, limit = 50) {
  return useQuery({
    queryKey: ['activity-feed', groupId, limit],
    queryFn: async (): Promise<FeedItem[]> => {
      const { data, error } = await supabase.rpc('get_group_activity_feed', {
        p_group_id: groupId,
        p_limit: limit,
        p_offset: 0,
      });

      if (error) throw error;
      return (data as FeedItem[]) ?? [];
    },
    enabled: !!groupId,
  });
}

export function useComments(targetType: string, targetId: string) {
  return useQuery({
    queryKey: ['comments', targetType, targetId],
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('comments')
        .select('*, profile:profiles(*)')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data as Comment[]) ?? [];
    },
    enabled: !!targetId,
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({
      targetType,
      targetId,
      body,
    }: {
      targetType: 'action_log' | 'goal' | 'sub_goal';
      targetId: string;
      body: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('comments')
        .insert({
          user_id: user.id,
          target_type: targetType,
          target_id: targetId,
          body,
        })
        .select('*, profile:profiles(*)')
        .single();

      if (error) throw error;
      return data as Comment;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['comments', variables.targetType, variables.targetId],
      });
    },
  });
}

export function useLogAction() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({
      subGoalId,
      note,
      mediaUrl,
      value = 1,
    }: {
      subGoalId: string;
      note?: string;
      mediaUrl?: string;
      value?: number;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('action_logs')
        .insert({
          user_id: user.id,
          sub_goal_id: subGoalId,
          note: note ?? null,
          media_url: mediaUrl ?? null,
          value,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goal'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
      useAuthStore.getState().fetchProfile();
    },
  });
}




