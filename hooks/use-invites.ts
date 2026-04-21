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
 * Inserts invite rows + checks which phones belong to existing users.
 * Sends push notifications to existing users.
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

      const results: InviteResult[] = [];

      for (const { phone, name } of phones) {
        // Upsert invite (re-invite if previously declined)
        const { data: invite, error: inviteError } = await supabase
          .from('group_invites')
          .upsert(
            {
              group_id: groupId,
              invited_by: user.id,
              phone,
              status: 'pending' as const,
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'group_id,phone' }
          )
          .select('id')
          .single();

        if (inviteError) {
          console.warn(`Failed to insert invite for ${phone}:`, inviteError.message);
          continue;
        }

        // Check if this phone belongs to an existing user
        const { data: existingUser } = await supabase
          .rpc('check_phone_exists', { p_phone: phone });

        const isExistingUser = !!existingUser;

        if (isExistingUser && existingUser) {
          // Resolve the invite immediately
          await supabase
            .from('group_invites')
            .update({ resolved_user_id: existingUser })
            .eq('id', invite.id);

          // Send push notification
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .single();

          const { data: group } = await supabase
            .from('groups')
            .select('name')
            .eq('id', groupId)
            .single();

          // Create in-app notification
          await supabase.from('notifications').insert({
            user_id: existingUser,
            type: 'group_invite',
            title: `${profile?.display_name ?? 'Someone'} invited you to join a group`,
            body: `Tap to view and accept the invite to "${group?.name ?? 'a group'}"`,
            data: { invite_id: invite.id, group_id: groupId, inviter_id: user.id },
          });

          // Send push notification via edge function
          try {
            await supabase.functions.invoke('send-push', {
              body: {
                user_id: existingUser,
                title: `${profile?.display_name ?? 'Someone'} invited you!`,
                body: `Join "${group?.name ?? 'a group'}" on CoGoal`,
                data: { invite_id: invite.id, group_id: groupId },
              },
            });
          } catch (e) {
            // Push failure shouldn't block the invite
            console.warn('Push notification failed:', e);
          }
        }

        results.push({
          phone,
          name,
          isExistingUser,
          inviteId: invite.id,
        });
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}
