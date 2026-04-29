import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get all profiles with their checkin cadences
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, display_name, checkin_cadence, last_action_date, streak_current');

    if (error || !profiles) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profiles' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    let remindersCreated = 0;
    let streaksBroken = 0;

    // Pre-fetch users who already received a checkin reminder today, so we
    // avoid one duplicate-check query per profile (was N+1 at scale).
    const { data: alreadyReminded } = await supabase
      .from('notifications')
      .select('user_id')
      .eq('type', 'checkin_reminder')
      .gte('created_at', today);
    const remindedSet = new Set((alreadyReminded ?? []).map((n: { user_id: string }) => n.user_id));

    for (const profile of profiles) {
      // Skip users who haven't set a cadence
      if (!profile.checkin_cadence) continue;

      // Determine cadence in days
      let cadenceDays = 1;
      switch (profile.checkin_cadence) {
        case 'daily':
          cadenceDays = 1;
          break;
        case 'every_2_days':
          cadenceDays = 2;
          break;
        case 'every_3_days':
          cadenceDays = 3;
          break;
        case 'weekly':
          cadenceDays = 7;
          break;
      }

      // Users who have never logged an action still need a reminder
      if (!profile.last_action_date) {
        if (remindedSet.has(profile.id)) continue;

        await supabase.from('notifications').insert({
          user_id: profile.id,
          type: 'checkin_reminder',
          title: '⏰ Time to check in!',
          body: "You haven't logged any actions yet. Start tracking your progress today!",
          data: { days_since: null },
        });

        await supabase.functions.invoke('send-push', {
          body: {
            user_id: profile.id,
            title: '⏰ Time to check in!',
            body: "You haven't logged any actions yet. Start tracking your progress today!",
            data: { type: 'checkin_reminder' },
          },
        });

        remindedSet.add(profile.id);
        remindersCreated++;
        continue;
      }

      const lastAction = new Date(profile.last_action_date);
      const daysSinceAction = Math.floor(
        (now.getTime() - lastAction.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Send reminder when the check-in window is due
      if (daysSinceAction >= cadenceDays) {
        if (!remindedSet.has(profile.id)) {
          const body = `It's been ${daysSinceAction} day${daysSinceAction !== 1 ? 's' : ''} since your last action. Keep your streak going!`;

          await supabase.from('notifications').insert({
            user_id: profile.id,
            type: 'checkin_reminder',
            title: '⏰ Time to check in!',
            body,
            data: { days_since: daysSinceAction },
          });

          await supabase.functions.invoke('send-push', {
            body: {
              user_id: profile.id,
              title: '⏰ Time to check in!',
              body,
              data: { type: 'checkin_reminder' },
            },
          });

          remindedSet.add(profile.id);
          remindersCreated++;
        }
      }

      // Break streak immediately when window is missed (no grace period)
      if (daysSinceAction > cadenceDays && profile.streak_current > 0) {
        const streakLabel = cadenceDays === 7
          ? `${profile.streak_current}-week`
          : `${profile.streak_current} check-in`;

        await supabase
          .from('profiles')
          .update({ streak_current: 0 })
          .eq('id', profile.id);

        await supabase.from('notifications').insert({
          user_id: profile.id,
          type: 'streak_broken',
          title: '💔 Streak broken',
          body: `Your ${streakLabel} streak has been reset. Start a new one today!`,
          data: { previous_streak: profile.streak_current },
        });
        streaksBroken++;
      }
    }

    return new Response(
      JSON.stringify({ remindersCreated, streaksBroken, profilesChecked: profiles.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
