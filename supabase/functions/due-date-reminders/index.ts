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

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    let remindersSent = 0;
    let missedMarked = 0;

    // ── 1. Due-date reminders (due tomorrow) ──────────────────────
    const { data: upcoming, error: upErr } = await supabase
      .from('sub_goals')
      .select('id, title, assigned_to, goal_id, goals:goal_id(title, group_id)')
      .eq('due_date', tomorrow)
      .in('status', ['not_started', 'in_progress'])
      .not('assigned_to', 'is', null);

    if (upErr) {
      console.error('Error fetching upcoming sub_goals:', upErr.message);
    }

    // Pre-fetch sub_goal_ids that already have a due_date_reminder today
    const upcomingIds = (upcoming ?? []).map((sg: any) => sg.id);
    const sentReminderIds = new Set<string>();
    if (upcomingIds.length > 0) {
      const { data: existing } = await supabase
        .from('notifications')
        .select('data')
        .eq('type', 'due_date_reminder')
        .gte('created_at', today)
        .in('data->>sub_goal_id', upcomingIds);
      for (const row of existing ?? []) {
        const id = (row as any).data?.sub_goal_id;
        if (id) sentReminderIds.add(id);
      }
    }

    for (const sg of upcoming ?? []) {
      const goal = (sg as any).goals;
      if (!sg.assigned_to || !goal) continue;

      if (sentReminderIds.has(sg.id)) continue;

      // Create in-app notification
      await supabase.from('notifications').insert({
        user_id: sg.assigned_to,
        type: 'due_date_reminder',
        title: '📅 Due tomorrow',
        body: `"${sg.title}" is due tomorrow. Don't forget!`,
        data: { sub_goal_id: sg.id, goal_id: sg.goal_id, group_id: goal.group_id },
      });

      // Send push notification
      await supabase.functions.invoke('send-push', {
        body: {
          user_id: sg.assigned_to,
          title: '📅 Due tomorrow',
          body: `"${sg.title}" is due tomorrow.`,
          data: { sub_goal_id: sg.id, goal_id: sg.goal_id, group_id: goal.group_id },
        },
      });

      remindersSent++;
    }

    // ── 2. Mark overdue sub-goals as missed ───────────────────────
    const { data: overdue, error: ovErr } = await supabase
      .from('sub_goals')
      .select('id, title, assigned_to, goal_id, goals:goal_id(title, group_id)')
      .lt('due_date', today)
      .in('status', ['not_started', 'in_progress'])
      .not('assigned_to', 'is', null);

    if (ovErr) {
      console.error('Error fetching overdue sub_goals:', ovErr.message);
    }

    // Pre-fetch already-notified overdue sub_goal_ids
    const overdueIds = (overdue ?? []).map((sg: any) => sg.id);
    const sentMissedIds = new Set<string>();
    if (overdueIds.length > 0) {
      const { data: existing } = await supabase
        .from('notifications')
        .select('data')
        .eq('type', 'due_date_missed')
        .in('data->>sub_goal_id', overdueIds);
      for (const row of existing ?? []) {
        const id = (row as any).data?.sub_goal_id;
        if (id) sentMissedIds.add(id);
      }
    }

    for (const sg of overdue ?? []) {
      const goal = (sg as any).goals;

      // Flip status to missed
      await supabase
        .from('sub_goals')
        .update({ status: 'missed' })
        .eq('id', sg.id);

      missedMarked++;

      if (!sg.assigned_to || !goal) continue;

      if (sentMissedIds.has(sg.id)) continue;

      await supabase.from('notifications').insert({
        user_id: sg.assigned_to,
        type: 'due_date_missed',
        title: '⚠️ Action overdue',
        body: `"${sg.title}" is past due. Update or reschedule it.`,
        data: { sub_goal_id: sg.id, goal_id: sg.goal_id, group_id: goal.group_id },
      });

      await supabase.functions.invoke('send-push', {
        body: {
          user_id: sg.assigned_to,
          title: '⚠️ Action overdue',
          body: `"${sg.title}" is past due.`,
          data: { sub_goal_id: sg.id, goal_id: sg.goal_id, group_id: goal.group_id },
        },
      });
    }

    return new Response(
      JSON.stringify({ remindersSent, missedMarked }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
