import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Batched reaction push notification digest.
 * Called via CRON every 2 minutes.
 *
 * Groups unsent reactions by goal, then sends a single push
 * to the goal owner summarising who reacted.
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

    // 1. Find all unsent reactions grouped by goal
    const { data: unsent, error: fetchErr } = await supabase
      .from('goal_reactions')
      .select(`
        id,
        goal_id,
        user_id,
        reaction_type,
        profile:profiles!goal_reactions_user_id_fkey(display_name)
      `)
      .eq('push_sent', false)
      .order('created_at', { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!unsent || unsent.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: 'No pending reactions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Group by goal_id
    const byGoal = new Map<string, { reactorNames: string[]; reactionIds: string[] }>();
    for (const r of unsent) {
      const entry = byGoal.get(r.goal_id) ?? { reactorNames: [], reactionIds: [] };
      const name = (r.profile as any)?.display_name ?? 'Someone';
      if (!entry.reactorNames.includes(name)) {
        entry.reactorNames.push(name);
      }
      entry.reactionIds.push(r.id);
      byGoal.set(r.goal_id, entry);
    }

    let totalSent = 0;

    for (const [goalId, { reactorNames, reactionIds }] of byGoal) {
      // 3. Get goal info (owner + group)
      const { data: goal } = await supabase
        .from('goals')
        .select('id, title, created_by, group_id')
        .eq('id', goalId)
        .single();

      if (!goal) continue;

      // 4. Build notification body
      const names = reactorNames.slice(0, 2);
      const remaining = reactorNames.length - names.length;
      let body: string;
      if (remaining > 0) {
        body = `${names.join(', ')} and ${remaining} other${remaining > 1 ? 's' : ''} reacted to "${goal.title}"`;
      } else {
        body = `${names.join(' and ')} reacted to "${goal.title}"`;
      }

      // 5. Get push tokens for goal owner
      const { data: tokens } = await supabase
        .from('push_tokens')
        .select('token')
        .eq('user_id', goal.created_by);

      if (tokens && tokens.length > 0) {
        const messages = tokens.map((t: { token: string }) => ({
          to: t.token,
          sound: 'default',
          title: '💬 New reactions on your goal',
          body,
          data: {
            type: 'goal_reaction',
            goal_id: goalId,
            group_id: goal.group_id,
          },
        }));

        // Chunk Expo push sends (max 100 per request)
        const CHUNK = 100;
        for (let i = 0; i < messages.length; i += CHUNK) {
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-Encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(messages.slice(i, i + CHUNK)),
          });
        }

        totalSent++;
      }

      // 6. Mark reactions as sent
      await supabase
        .from('goal_reactions')
        .update({ push_sent: true })
        .in('id', reactionIds);
    }

    return new Response(
      JSON.stringify({ sent: totalSent, message: `Processed ${byGoal.size} goals` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('send-reaction-digest error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
