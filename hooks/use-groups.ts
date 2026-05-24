import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import * as Sentry from '@sentry/react-native';
import posthog from '../lib/posthog';
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

      // Batch fetch members + active goals for ALL groups in two queries (avoid N+1)
      const [{ data: allMembers }, { data: allGoals }] = await Promise.all([
        supabase
          .from('group_members')
          .select('*, profile:profiles(*)')
          .in('group_id', groupIds),
        supabase
          .from('goals')
          .select('*')
          .in('group_id', groupIds)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
      ]);

      const membersByGroup = new Map<string, GroupMember[]>();
      for (const m of (allMembers as GroupMember[] | null) ?? []) {
        const list = membersByGroup.get(m.group_id) ?? [];
        list.push(m);
        membersByGroup.set(m.group_id, list);
      }

      const goalsByGroup = new Map<string, Goal[]>();
      for (const g of (allGoals as Goal[] | null) ?? []) {
        if (!g.group_id) continue;
        const list = goalsByGroup.get(g.group_id) ?? [];
        list.push(g);
        goalsByGroup.set(g.group_id, list);
      }

      return (groups as Group[]).map((group) => {
        const members = membersByGroup.get(group.id) ?? [];
        return {
          ...group,
          members,
          active_goals: goalsByGroup.get(group.id) ?? [],
          member_count: members.length,
        } satisfies GroupWithDetails;
      });
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
    onError: (error) => { Sentry.captureException(error, { tags: { mutation: 'createGroup' } }); },
    onSuccess: (data) => {
      posthog.capture('group_created', { group_id: data.id, group_name: data.name });
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
    onError: (error) => { Sentry.captureException(error, { tags: { mutation: 'joinGroup' } }); },
    onSuccess: (data) => {
      Sentry.addBreadcrumb({ category: 'group', message: 'User joined a group', level: 'info', data: { group_id: data?.group_id } });
      posthog.capture('group_joined', { group_id: data?.group_id });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ groupId, name, cover_image }: { groupId: string; name?: string; cover_image?: string }) => {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (cover_image !== undefined) patch.cover_image = cover_image;

      const { error } = await supabase
        .from('groups')
        .update(patch)
        .eq('id', groupId);

      if (error) throw error;
    },
    onError: (error) => { Sentry.captureException(error, { tags: { mutation: 'updateGroup' } }); },
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
    onError: (error) => { Sentry.captureException(error, { tags: { mutation: 'leaveGroup' } }); },
    onSuccess: (_, variables) => {
      posthog.capture('group_left', { group_id: variables.groupId });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}
