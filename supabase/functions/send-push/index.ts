import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  type?: string;
  persist?: boolean;
  data?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const payload: PushPayload = await req.json();
    const { user_id, title, body, type, persist = true, data } = payload;

    if (!user_id || !title) {
      return new Response(
        JSON.stringify({ error: 'user_id and title are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Always persist an in-app notification row (best effort), unless caller opts out
    if (persist !== false) {
      const notifType = type ?? (typeof data?.type === 'string' ? data.type : 'push');
      await supabase.from('notifications').insert({
        user_id,
        type: notifType,
        title,
        body,
        data: data ?? {},
      });
    }

    // Fetch all push tokens for this user
    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', user_id);

    if (tokensError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: 'No push tokens found for user' }),
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

    // Send via Expo Push API in chunks of 100 (Expo's recommended batch size)
    const CHUNK = 100;
    const invalidTokens: string[] = [];
    for (let i = 0; i < messages.length; i += CHUNK) {
      const slice = messages.slice(i, i + CHUNK);
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slice),
      });
      const result = await response.json();
      if (result.data && Array.isArray(result.data)) {
        result.data.forEach((receipt: { status: string; details?: { error: string } }, idx: number) => {
          if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
            invalidTokens.push(tokens[i + idx].token);
          }
        });
      }
    }

    // Clean up invalid tokens (DeviceNotRegistered errors)
    if (invalidTokens.length > 0) {
      await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', user_id)
        .in('token', invalidTokens);
    }

    return new Response(
      JSON.stringify({ sent: messages.length, invalidated: invalidTokens.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
