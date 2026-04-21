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
    let remindersCreated = 0;
    let streaksBroken = 0;

    for (const profile of profiles) {
      if (!profile.last_action_date) continue;

      const lastAction = new Date(profile.last_action_date);
      const daysSinceAction = Math.floor(
        (now.getTime() - lastAction.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Determine cadence in days
      let cadenceDays = 1;
      switch (profile.checkin_cadence) {
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

      // Send reminder when the check-in window is due
      if (daysSinceAction >= cadenceDays) {
        await supabase.from('notifications').insert({
          user_id: profile.id,
          type: 'checkin_reminder',
          title: '⏰ Time to check in!',
          body: `It's been ${daysSinceAction} day${daysSinceAction !== 1 ? 's' : ''} since your last action. Keep your streak going!`,
          data: { days_since: daysSinceAction },
        });
        remindersCreated++;
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
