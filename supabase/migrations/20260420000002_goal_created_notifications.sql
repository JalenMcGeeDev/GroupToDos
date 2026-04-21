-- When a goal is created in a group, notify all other group members
CREATE OR REPLACE FUNCTION public.notify_group_goal_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_name TEXT;
  v_group_ids UUID[];
  v_gid UUID;
  v_member RECORD;
BEGIN
  -- Only fire on INSERT
  IF TG_OP != 'INSERT' THEN RETURN NEW; END IF;

  -- Get all group IDs this goal belongs to
  v_group_ids := public.get_goal_group_ids(NEW.id);
  IF v_group_ids IS NULL THEN RETURN NEW; END IF;

  -- Get creator display name
  SELECT display_name INTO v_creator_name FROM public.profiles WHERE id = NEW.created_by;

  -- For each group, notify all members except the creator
  FOREACH v_gid IN ARRAY v_group_ids LOOP
    FOR v_member IN
      SELECT user_id FROM public.group_members
      WHERE group_id = v_gid AND user_id != NEW.created_by
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_member.user_id,
        'teammate_action',
        COALESCE(v_creator_name, 'Someone') || ' created a new goal',
        '"' || NEW.title || '"',
        jsonb_build_object(
          'user_id', NEW.created_by,
          'goal_id', NEW.id,
          'group_id', v_gid
        )
      );
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_goal_created ON public.goals;
CREATE TRIGGER trg_notify_goal_created
  AFTER INSERT ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.notify_group_goal_created();
