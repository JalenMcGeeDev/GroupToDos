import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
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

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { data, error } = await supabase.rpc('accept_invite', {
        p_invite_id: inviteId,
      });
      if (error) throw error;
      return data as string; // returns group_id
    },
    onSuccess: () => {
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
    onSuccess: () => {
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
                  data: { invite_id: r.invite_id, group_id: groupId },
                },
              })
              .catch((e) => {
                console.warn('Push notification failed:', e);
              })
          )
        );
      }

      // Surface entries the RPC skipped (invalid format, already a member) so
      // the user sees feedback for every phone they tried to invite.
      const returnedPhones = new Set(rows.map((r) => r.phone));
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] });
    },
  });
}
