-- ============================================================
-- TRIGGERS for CoGoal
-- ============================================================

-- ----------------------------------------
-- Auto-create profile when a new user signs up
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------
-- Auto-update updated_at timestamps
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_sub_goals_updated_at
  BEFORE UPDATE ON public.sub_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------
-- Auto-award XP when an action is logged
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.handle_action_logged()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_xp INTEGER := 10; -- Base XP for logging an action
BEGIN
  -- Award base XP
  PERFORM public.award_xp(NEW.user_id, v_xp, 'action_logged', NEW.id);

  -- Update the action log with XP earned
  UPDATE public.action_logs SET xp_earned = v_xp WHERE id = NEW.id;

  -- Check and update streaks
  PERFORM public.check_and_update_streak(NEW.user_id);

  -- Update sub-goal progress if it's a completion
  IF NEW.value >= 1 THEN
    UPDATE public.sub_goals
    SET current_value = COALESCE(current_value, 0) + NEW.value,
        status = CASE
          WHEN COALESCE(current_value, 0) + NEW.value >= COALESCE(target_value, 1)
          THEN 'completed'::public.sub_goal_status
          ELSE 'in_progress'::public.sub_goal_status
        END
    WHERE id = NEW.sub_goal_id;
  END IF;

  -- Recalculate goal progress
  PERFORM public.calculate_goal_progress(
    (SELECT goal_id FROM public.sub_goals WHERE id = NEW.sub_goal_id)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_action_logged
  AFTER INSERT ON public.action_logs
  FOR EACH ROW EXECUTE FUNCTION public.handle_action_logged();

-- ----------------------------------------
-- Auto-award XP when encouragement is sent
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.handle_encouragement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Award XP to the person who sent the encouragement
  PERFORM public.award_xp(NEW.from_user_id, 3, 'encourage', NEW.id);

  -- Create notification for the recipient
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.to_user_id,
    'encourage',
    'You got encouraged!',
    (SELECT display_name FROM public.profiles WHERE id = NEW.from_user_id) || ' encouraged you!',
    jsonb_build_object('from_user_id', NEW.from_user_id, 'action_log_id', NEW.action_log_id)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_encouragement_sent
  AFTER INSERT ON public.encouragements
  FOR EACH ROW EXECUTE FUNCTION public.handle_encouragement();

-- ----------------------------------------
-- Auto-check sub-goal completion cascading
-- When a week sub-goal completes, check if monthly milestone is done
-- When monthly completes, check quarterly
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.handle_sub_goal_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_id UUID;
  v_siblings_total INTEGER;
  v_siblings_completed INTEGER;
  v_goal_id UUID;
BEGIN
  -- Only fire when status changes to completed
  IF NEW.status != 'completed' OR (OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  v_goal_id := NEW.goal_id;

  -- Award XP based on level
  CASE NEW.level
    WHEN 'week' THEN
      IF NEW.assigned_to IS NOT NULL THEN
        PERFORM public.award_xp(NEW.assigned_to, 25, 'weekly_complete', NEW.id);
      END IF;
    WHEN 'month' THEN
      IF NEW.assigned_to IS NOT NULL THEN
        PERFORM public.award_xp(NEW.assigned_to, 75, 'monthly_complete', NEW.id);
      END IF;
    WHEN 'key_result' THEN
      IF NEW.assigned_to IS NOT NULL THEN
        PERFORM public.award_xp(NEW.assigned_to, 25, 'okr_key_result_complete', NEW.id);
      END IF;
    WHEN 'milestone' THEN
      IF NEW.assigned_to IS NOT NULL THEN
        PERFORM public.award_xp(NEW.assigned_to, 25, 'smart_milestone_complete', NEW.id);
      END IF;
    ELSE
      NULL;
  END CASE;

  -- Check if parent sub-goal should be completed
  IF NEW.parent_id IS NOT NULL THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
    INTO v_siblings_total, v_siblings_completed
    FROM public.sub_goals
    WHERE parent_id = NEW.parent_id;

    IF v_siblings_total = v_siblings_completed THEN
      UPDATE public.sub_goals
      SET status = 'completed'
      WHERE id = NEW.parent_id;
    END IF;
  END IF;

  -- Check if entire goal is complete
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_siblings_total, v_siblings_completed
  FROM public.sub_goals
  WHERE goal_id = v_goal_id AND parent_id IS NULL;

  IF v_siblings_total > 0 AND v_siblings_total = v_siblings_completed THEN
    UPDATE public.goals
    SET status = 'completed', progress = 100, updated_at = now()
    WHERE id = v_goal_id AND status = 'active';

    -- Award goal completion XP to all assigned members
    PERFORM public.award_xp(sg.assigned_to, 500, 'goal_complete', v_goal_id)
    FROM (
      SELECT DISTINCT assigned_to FROM public.sub_goals
      WHERE goal_id = v_goal_id AND assigned_to IS NOT NULL
    ) sg;
  END IF;

  -- Recalculate goal progress
  PERFORM public.calculate_goal_progress(v_goal_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_sub_goal_status_change
  AFTER UPDATE OF status ON public.sub_goals
  FOR EACH ROW EXECUTE FUNCTION public.handle_sub_goal_completion();

-- ----------------------------------------
-- Auto-add creator as owner when group is created
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.handle_group_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_group_created
  AFTER INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_group_created();
