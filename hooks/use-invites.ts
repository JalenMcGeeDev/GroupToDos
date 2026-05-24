import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import * as Sentry from '@sentry/react-native';
import posthog from '../lib/posthog';
import type { GroupInvite, InviteResult } from '../lib/types';

/** Fetch pending invites for the current user */
export function useMyPendingInvites() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['pending-invites', user?.id],
    queryFn: async (): Promise<GroupInvite[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('group_invites')
        .select('*, group:groups(*), inviter_profile:profiles!group_invites_invited_by_fkey(*)')
        .eq('resolved_user_id', user.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as GroupInvite[];
    },
    enabled: !!user,
  });
}

/** Accept a group invite */
export function useAcceptInvite() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async (inviteId: string) => {
      // Fetch invite details before the RPC changes its status
      const { data: invite } = await supabase
        .from('group_invites')
        .select('invited_by, group_id, groups(name)')
        .eq('id', inviteId)
        .single();

      const { data, error } = await supabase.rpc('accept_invite', {
        p_invite_id: inviteId,
      });
      if (error) throw error;

      // Send push to the inviter. The RPC already wrote the DB notification row,
      // so pass persist: false to avoid a duplicate.
      if (invite && user && invite.invited_by !== user.id) {
        try {
          const { data: accepterProfile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .single();

          const accepterName = accepterProfile?.display_name ?? 'Someone';
          const groupName = (invite.groups as any)?.name ?? 'your group';

          await supabase.functions.invoke('send-push', {
            body: {
              user_id: invite.invited_by,
              title: `${accepterName} accepted your invite`,
              body: `They joined "${groupName}"`,
              type: 'member_joined',
              persist: false,
              data: { type: 'member_joined', group_id: invite.group_id },
            },
          });
        } catch (e) {
          console.warn('Failed to send accept invite push:', e);
          Sentry.addBreadcrumb({ category: 'push', message: 'send-push edge function failed (accept invite)', level: 'warning', data: { inviteId } });
        }
      }

      return data as string; // returns group_id
    },
    onError: (error) => { Sentry.captureException(error, { tags: { mutation: 'acceptInvite' } }); },
    onSuccess: (_, inviteId) => {
      posthog.capture('invite_accepted', { invite_id: inviteId });
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

/** Decline a group invite */
export function useDeclineInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.rpc('decline_invite', {
        p_invite_id: inviteId,
      });
      if (error) throw error;
    },
    onError: (error) => { Sentry.captureException(error, { tags: { mutation: 'declineInvite' } }); },
    onSuccess: (_, inviteId) => {
      posthog.capture('invite_declined', { invite_id: inviteId });
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] });
    },
  });
}

/**
 * Invite phone numbers to a group.
 * Delegates the upsert + existing-user resolution + notification creation to a
 * SECURITY DEFINER RPC so it works regardless of client RLS, then fires
 * Expo push notifications client-side for users with CoGoal installed.
 */
export function useInviteToGroup() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({
      groupId,
      phones,
    }: {
      groupId: string;
      phones: { phone: string; name?: string }[];
    }): Promise<InviteResult[]> => {
      if (!user) throw new Error('Not authenticated');
      if (!phones.length) return [];

      // Server-side: upsert invites, resolve to existing users, create
      // in-app notifications for them (bypasses client RLS).
      const { data, error } = await supabase.rpc('send_group_invites', {
        p_group_id: groupId,
        p_phones: phones.map((p) => ({ phone: p.phone, name: p.name ?? null })),
      });

      if (error) throw error;

      const rows = (data ?? []) as Array<{
        phone: string;
        name: string | null;
        invite_id: string;
        resolved_user_id: string | null;
        is_existing_user: boolean;
      }>;

      const results: InviteResult[] = rows.map((r) => ({
        phone: r.phone,
        name: r.name ?? undefined,
        isExistingUser: r.is_existing_user,
        inviteId: r.invite_id,
      }));

      // Push notifications for existing users (best effort, non-blocking)
      const existing = rows.filter((r) => r.is_existing_user && r.resolved_user_id);
      if (existing.length > 0) {
        const [{ data: profile }, { data: group }] = await Promise.all([
          supabase.from('profiles').select('display_name').eq('id', user.id).single(),
          supabase.from('groups').select('name').eq('id', groupId).single(),
        ]);

        const inviterName = profile?.display_name ?? 'Someone';
        const groupName = group?.name ?? 'a group';

        await Promise.all(
          existing.map((r) =>
            supabase.functions
              .invoke('send-push', {
                body: {
                  user_id: r.resolved_user_id,
                  title: `${inviterName} invited you!`,
                  body: `Join "${groupName}" on CoGoal`,
                  data: { type: 'group_invite', invite_id: r.invite_id, group_id: groupId },
                },
              })
              .catch((e) => {
                console.warn('Push notification failed:', e);
                Sentry.addBreadcrumb({ category: 'push', message: 'send-push edge function failed (invite)', level: 'warning' });
              })
          )
        );
      }

      // Surface entries the RPC skipped (invalid format, already a member) so
      // the user sees feedback for every phone they tried to invite.
      const returnedPhones = new Set(rows.map((r) => r.phone.replace(/\D/g, '').slice(-10)));
      for (const p of phones) {
        const norm = p.phone.replace(/\D/g, '').slice(-10);
        if (norm.length === 10 && !returnedPhones.has(norm)) {
          results.push({
            phone: p.phone,
            name: p.name,
            isExistingUser: false,
            inviteId: '',
          });
        }
      }

      return results;
    },
    onError: (error) => { Sentry.captureException(error, { tags: { mutation: 'inviteToGroup' } }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] });
      queryClient.invalidateQueries({ queryKey: ['sent-pending-invites'] });
    },
  });
}

/** Fetch pending invites sent by the current user for a specific group */
export function useGroupSentPendingInvites(groupId: string | undefined) {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['sent-pending-invites', groupId, user?.id],
    queryFn: async (): Promise<GroupInvite[]> => {
      if (!user || !groupId) return [];

      const { data, error } = await supabase
        .from('group_invites')
        .select('*')
        .eq('group_id', groupId)
        .eq('invited_by', user.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as GroupInvite[];
    },
    enabled: !!user && !!groupId,
  });
}
