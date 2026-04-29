import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GroupPushPayload {
  group_id: string;
  exclude_user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Send push notification to all members of a group, excluding one user.
 * Used for goal completion announcements.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const payload: GroupPushPayload = await req.json();
    const { group_id, exclude_user_id, title, body, data } = payload;

    if (!group_id || !title) {
      return new Response(
        JSON.stringify({ error: 'group_id and title are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all group member IDs except the excluded user
    const { data: members, error: membersErr } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group_id)
      .neq('user_id', exclude_user_id);

    if (membersErr) throw membersErr;
    if (!members || members.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: 'No other group members' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const memberIds = members.map((m: { user_id: string }) => m.user_id);

    // Get all push tokens for these members
    const { data: tokens, error: tokensErr } = await supabase
      .from('push_tokens')
      .select('token, user_id')
      .in('user_id', memberIds);

    if (tokensErr) throw tokensErr;
    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: 'No push tokens for group members' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build Expo push messages
    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      sound: 'default',
      title,
      body,
      data: data ?? {},
    }));

    // Send via Expo Push API in chunks of 100
    const CHUNK = 100;
    const invalidTokens: string[] = [];
    for (let i = 0; i < messages.length; i += CHUNK) {
      const slice = messages.slice(i, i + CHUNK);
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slice),
      });
      const result = await response.json();
      if (result.data && Array.isArray(result.data)) {
        result.data.forEach((item: any, idx: number) => {
          if (item.status === 'error' && item.details?.error === 'DeviceNotRegistered') {
            invalidTokens.push(tokens[i + idx].token);
          }
        });
      }
    }

    // Clean up invalid tokens (guard against empty array)
    if (invalidTokens.length > 0) {
      await supabase
        .from('push_tokens')
        .delete()
        .in('token', invalidTokens);
    }

    return new Response(
      JSON.stringify({ sent: messages.length, invalidated: invalidTokens.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('send-group-push error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
