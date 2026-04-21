import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import type { Group, GroupMember, GroupWithDetails, Goal } from '../lib/types';

export function useGroups() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['groups', user?.id],
    queryFn: async (): Promise<GroupWithDetails[]> => {
      if (!user) return [];

      // Get groups the user is a member of
      const { data: memberships, error: memError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id);

      if (memError || !memberships?.length) return [];

      const groupIds = memberships.map((m) => m.group_id);

      const { data: groups, error } = await supabase
        .from('groups')
        .select('*')
        .in('id', groupIds)
        .order('updated_at', { ascending: false });

      if (error || !groups) return [];

      // Fetch members and active goals for each group
      const enriched = await Promise.all(
        (groups as Group[]).map(async (group) => {
          const [{ data: members }, { data: goals }] = await Promise.all([
            supabase
              .from('group_members')
              .select('*, profile:profiles(*)')
              .eq('group_id', group.id),
            supabase
              .from('goals')
              .select('*')
              .eq('group_id', group.id)
              .eq('status', 'active')
              .order('created_at', { ascending: false }),
          ]);

          return {
            ...group,
            members: (members as GroupMember[]) ?? [],
            active_goals: (goals as Goal[]) ?? [],
            member_count: members?.length ?? 0,
          } satisfies GroupWithDetails;
        })
      );

      return enriched;
    },
    enabled: !!user,
  });
}

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: ['group', groupId],
    queryFn: async (): Promise<GroupWithDetails | null> => {
      const { data: group, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (error || !group) return null;

      const [{ data: members }, { data: goals }] = await Promise.all([
        supabase
          .from('group_members')
          .select('*, profile:profiles(*)')
          .eq('group_id', groupId),
        supabase
          .from('goals')
          .select('*')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false }),
      ]);

      return {
        ...(group as Group),
        members: (members as GroupMember[]) ?? [],
        active_goals: ((goals as Goal[]) ?? []).filter((g) => g.status === 'active'),
        member_count: members?.length ?? 0,
      };
    },
    enabled: !!groupId,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({ name, invitePhones }: { name: string; invitePhones?: string[] }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('groups')
        .insert({ name, created_by: user.id })
        .select()
        .single();

      if (error) throw error;

      return data as Group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ inviteCode }: { inviteCode: string }) => {
      const { data, error } = await supabase.rpc('join_group_by_invite_code', {
        p_invite_code: inviteCode,
      });

      if (error) throw error;
      return data as { group_id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ groupId, name }: { groupId: string; name: string }) => {
      const { error } = await supabase
        .from('groups')
        .update({ name })
        .eq('id', groupId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] });
    },
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({ groupId }: { groupId: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}
