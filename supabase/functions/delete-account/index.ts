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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Missing authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify the caller's JWT and get their user id
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const userId = user.id;

  // Admin client bypasses RLS
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    // 1. Remove user from all groups.
    //    The trigger `trg_transfer_ownership_on_leave` automatically promotes
    //    the next oldest member to owner, or deletes the group if no one remains.
    const { error: memberErr } = await admin
      .from('group_members')
      .delete()
      .eq('user_id', userId);
    if (memberErr) throw memberErr;

    // 2. Delete all goals created by this user (cascades to sub_goals, reactions, etc.)
    const { error: goalsErr } = await admin
      .from('goals')
      .delete()
      .eq('created_by', userId);
    if (goalsErr) throw goalsErr;

    // 3. Delete the auth user. The profiles row is deleted via ON DELETE CASCADE
    //    on profiles.id -> auth.users.id.
    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
    if (deleteErr) throw deleteErr;

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
