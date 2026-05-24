import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Returns the user's current local hour (0-23), or -1 if timezone is invalid.
function getLocalHour(timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === 'hour');
    return hourPart ? parseInt(hourPart.value, 10) : -1;
  } catch {
    return -1;
  }
}

async function sendPush(payload: Record<string, unknown>): Promise<boolean> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`send-push HTTP ${res.status} for user ${payload.user_id}: ${text}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`send-push fetch failed for user ${payload.user_id}:`, (err as Error).message);
    return false;
  }
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

    // Get all profiles with their checkin cadences and timezones
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, display_name, checkin_cadence, last_action_date, streak_current, timezone');

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
    let skippedWrongHour = 0;

    // Pre-fetch users who already received a checkin reminder today to avoid duplicates.
    const { data: alreadyReminded } = await supabase
      .from('notifications')
      .select('user_id')
      .eq('type', 'checkin_reminder')
      .gte('created_at', today);
    const remindedSet = new Set((alreadyReminded ?? []).map((n: { user_id: string }) => n.user_id));

    for (const profile of profiles) {
      // Skip users who haven't set a cadence
      if (!profile.checkin_cadence) continue;

      const localHour = getLocalHour(profile.timezone ?? 'America/New_York');

      // Determine cadence in days (needed by both reminder and streak-break logic)
      let cadenceDays = 1;
      switch (profile.checkin_cadence) {
        case 'daily':       cadenceDays = 1; break;
        case 'every_2_days': cadenceDays = 2; break;
        case 'every_3_days': cadenceDays = 3; break;
        case 'weekly':      cadenceDays = 7; break;
      }

      const daysSinceAction = profile.last_action_date
        ? Math.floor((now.getTime() - new Date(profile.last_action_date).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // ── Streak break: runs at midnight (hour 0) local time ─────────────────
      // The user had until 11:59:59pm of the due day; if it's now past midnight
      // and the window has elapsed, reset the streak.
      if (localHour === 0 && profile.streak_current > 0) {
        const missed = daysSinceAction !== null && daysSinceAction > cadenceDays;
        if (missed) {
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

      // ── Check-in reminder: runs at 9am local time ──────────────────────────
      if (localHour !== 9) {
        skippedWrongHour++;
        continue;
      }

      // Users who have never logged an action still need a reminder
      if (!profile.last_action_date) {
        if (remindedSet.has(profile.id)) continue;

        const ok = await sendPush({
          user_id: profile.id,
          title: '⏰ Time to check in!',
          body: "You haven't logged any actions yet. Start tracking your progress today!",
          data: { type: 'checkin_reminder', days_since: null },
        });
        if (!ok) continue;

        remindedSet.add(profile.id);
        remindersCreated++;
        continue;
      }

      // Send reminder when the check-in window is due
      if (daysSinceAction !== null && daysSinceAction >= cadenceDays) {
        if (!remindedSet.has(profile.id)) {
          const body = `It's been ${daysSinceAction} day${daysSinceAction !== 1 ? 's' : ''} since your last check-in. Keep your streak going!`;

          const ok = await sendPush({
            user_id: profile.id,
            title: '⏰ Time to check in!',
            body,
            data: { type: 'checkin_reminder', days_since: daysSinceAction },
          });
          if (!ok) continue;

          remindedSet.add(profile.id);
          remindersCreated++;
        }
      }
    }

    return new Response(
      JSON.stringify({ remindersCreated, streaksBroken, skippedWrongHour, profilesChecked: profiles.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
