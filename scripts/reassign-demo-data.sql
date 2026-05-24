-- Reassign all demo data from +19196140457 to +10000000000
-- Run this in the Supabase SQL editor

DO $$
DECLARE
  v_real_id  UUID := 'c7f7795d-5550-472c-bc3c-43b167b8dee4';
  v_demo_id  UUID := '4fcdc1c9-8ae5-44b3-8240-0466d9fc6b57';
BEGIN
  RAISE NOTICE 'Reassigning from % to %', v_real_id, v_demo_id;

  -- Disable user triggers to avoid side effects
  ALTER TABLE public.groups            DISABLE TRIGGER USER;
  ALTER TABLE public.group_members     DISABLE TRIGGER USER;
  ALTER TABLE public.goals             DISABLE TRIGGER USER;
  ALTER TABLE public.sub_goals         DISABLE TRIGGER USER;
  ALTER TABLE public.action_logs       DISABLE TRIGGER USER;
  ALTER TABLE public.help_offers       DISABLE TRIGGER USER;
  ALTER TABLE public.help_requests     DISABLE TRIGGER USER;
  ALTER TABLE public.comments          DISABLE TRIGGER USER;
  ALTER TABLE public.goal_reactions    DISABLE TRIGGER USER;
  ALTER TABLE public.group_activities  DISABLE TRIGGER USER;
  ALTER TABLE public.notifications     DISABLE TRIGGER USER;
  ALTER TABLE public.goal_group_shares DISABLE TRIGGER USER;

  -- Reassign all rows (using correct column names per table)
  UPDATE public.groups            SET created_by   = v_demo_id WHERE created_by   = v_real_id;
  UPDATE public.group_members     SET user_id      = v_demo_id WHERE user_id      = v_real_id;
  UPDATE public.goals             SET created_by   = v_demo_id WHERE created_by   = v_real_id;
  UPDATE public.sub_goals         SET assigned_to  = v_demo_id WHERE assigned_to  = v_real_id;
  UPDATE public.action_logs       SET user_id      = v_demo_id WHERE user_id      = v_real_id;
  UPDATE public.help_offers       SET offered_by   = v_demo_id WHERE offered_by   = v_real_id;
  UPDATE public.help_requests     SET requested_by = v_demo_id WHERE requested_by = v_real_id;
  UPDATE public.comments          SET user_id      = v_demo_id WHERE user_id      = v_real_id;
  UPDATE public.goal_reactions    SET user_id      = v_demo_id WHERE user_id      = v_real_id;
  UPDATE public.group_activities  SET user_id      = v_demo_id WHERE user_id      = v_real_id;
  UPDATE public.notifications     SET user_id      = v_demo_id WHERE user_id      = v_real_id;
  UPDATE public.goal_group_shares SET shared_by    = v_demo_id WHERE shared_by    = v_real_id;

  -- Re-enable triggers
  ALTER TABLE public.groups            ENABLE TRIGGER USER;
  ALTER TABLE public.group_members     ENABLE TRIGGER USER;
  ALTER TABLE public.goals             ENABLE TRIGGER USER;
  ALTER TABLE public.sub_goals         ENABLE TRIGGER USER;
  ALTER TABLE public.action_logs       ENABLE TRIGGER USER;
  ALTER TABLE public.help_offers       ENABLE TRIGGER USER;
  ALTER TABLE public.help_requests     ENABLE TRIGGER USER;
  ALTER TABLE public.comments          ENABLE TRIGGER USER;
  ALTER TABLE public.goal_reactions    ENABLE TRIGGER USER;
  ALTER TABLE public.group_activities  ENABLE TRIGGER USER;
  ALTER TABLE public.notifications     ENABLE TRIGGER USER;
  ALTER TABLE public.goal_group_shares ENABLE TRIGGER USER;

  RAISE NOTICE 'Done. All demo data reassigned to demo user.';
END;
$$;
