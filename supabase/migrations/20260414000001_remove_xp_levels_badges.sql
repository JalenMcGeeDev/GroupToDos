-- ============================================================
-- Remove XP, Levels, and Badges system from the database
-- ============================================================

-- 1. Drop triggers that reference XP functions
DROP TRIGGER IF EXISTS on_action_logged ON public.action_logs;
DROP TRIGGER IF EXISTS on_encouragement_sent ON public.encouragements;
DROP TRIGGER IF EXISTS on_sub_goal_status_change ON public.sub_goals;

-- 2. Recreate handle_action_logged without XP logic
CREATE OR REPLACE FUNCTION public.handle_action_logged()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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

-- 3. Recreate handle_encouragement without XP logic
CREATE OR REPLACE FUNCTION public.handle_encouragement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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

-- 4. Recreate handle_sub_goal_completion without XP logic
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
  v_all_complete BOOLEAN;
BEGIN
  v_goal_id := NEW.goal_id;

  -- === Handle completion: sub_goal changed TO 'completed' ===
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN

    -- Check if parent sub-goal should be auto-completed
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

    -- Check if entire goal is now complete (all top-level actions done)
    SELECT COUNT(*) = COUNT(*) FILTER (WHERE status = 'completed')
    INTO v_all_complete
    FROM public.sub_goals
    WHERE goal_id = v_goal_id AND parent_id IS NULL;

    IF v_all_complete THEN
      UPDATE public.goals
      SET status = 'completed', progress = 100, updated_at = now()
      WHERE id = v_goal_id AND status = 'active';
    END IF;

  END IF;

  -- === Handle un-completion: sub_goal changed FROM 'completed' ===
  IF OLD.status = 'completed' AND NEW.status != 'completed' THEN

    -- If parent was auto-completed, revert it
    IF NEW.parent_id IS NOT NULL THEN
      UPDATE public.sub_goals
      SET status = 'in_progress'
      WHERE id = NEW.parent_id AND status = 'completed';
    END IF;

    -- Revert goal to active if it was marked completed
    UPDATE public.goals
    SET status = 'active', updated_at = now()
    WHERE id = v_goal_id AND status = 'completed';

  END IF;

  -- Always recalculate goal progress
  PERFORM public.calculate_goal_progress(v_goal_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_sub_goal_status_change
  AFTER UPDATE OF status ON public.sub_goals
  FOR EACH ROW EXECUTE FUNCTION public.handle_sub_goal_completion();

-- 5. Recreate check_and_update_streak without XP bonus awards
DROP FUNCTION IF EXISTS public.check_and_update_streak(UUID);
CREATE OR REPLACE FUNCTION public.check_and_update_streak(p_user_id UUID)
RETURNS TABLE(current_streak INTEGER, streak_bonus INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_action DATE;
  v_today DATE := CURRENT_DATE;
  v_streak INTEGER;
BEGIN
  -- Get current streak info
  SELECT p.streak_current, p.last_action_date
  INTO v_streak, v_last_action
  FROM public.profiles p WHERE p.id = p_user_id;

  IF v_last_action IS NULL OR v_last_action < v_today - INTERVAL '1 day' THEN
    v_streak := 1;
  ELSIF v_last_action = v_today - INTERVAL '1 day' THEN
    v_streak := v_streak + 1;
  ELSIF v_last_action = v_today THEN
    current_streak := v_streak;
    streak_bonus := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET streak_current = v_streak,
      streak_longest = GREATEST(streak_longest, v_streak),
      last_action_date = v_today,
      updated_at = now()
  WHERE id = p_user_id;

  current_streak := v_streak;
  streak_bonus := 0;
  RETURN NEXT;
END;
$$;

-- 6. Replace get_group_activity_feed to remove xp_earned column
DROP FUNCTION IF EXISTS public.get_group_activity_feed(UUID, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.get_group_activity_feed(
  p_group_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  type TEXT,
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  title TEXT,
  note TEXT,
  media_url TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ga.id,
    ga.type::TEXT,
    ga.user_id,
    p.display_name,
    p.avatar_url,
    CASE ga.type
      WHEN 'action_completed'       THEN 'Completed action: ' || (ga.metadata->>'action_title')
      WHEN 'goal_created'           THEN 'Created goal: '     || (ga.metadata->>'goal_title')
      WHEN 'goal_completed'         THEN 'Completed goal: '   || (ga.metadata->>'goal_title')
      WHEN 'goal_shared'            THEN 'Shared goal: '      || (ga.metadata->>'goal_title')
      WHEN 'action_added'           THEN 'Added action: '     || (ga.metadata->>'action_title')
      WHEN 'action_due_date_changed' THEN 'Set due date on: '  || (ga.metadata->>'action_title')
      WHEN 'member_joined'          THEN (ga.metadata->>'display_name') || ' joined the group'
      WHEN 'member_left'            THEN (ga.metadata->>'display_name') || ' left the group'
    END AS title,
    NULL::TEXT AS note,
    NULL::TEXT AS media_url,
    ga.created_at
  FROM public.group_activities ga
  JOIN public.profiles p ON p.id = ga.user_id
  WHERE ga.group_id = p_group_id
  ORDER BY ga.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 7. Drop XP-specific functions
DROP FUNCTION IF EXISTS public.award_xp(UUID, INTEGER, public.xp_action_type, UUID);
DROP FUNCTION IF EXISTS public.calculate_level(INTEGER);
DROP FUNCTION IF EXISTS public.get_group_leaderboard(UUID);

-- 8. Drop XP/badge tables
DROP TABLE IF EXISTS public.user_badges CASCADE;
DROP TABLE IF EXISTS public.badges CASCADE;
DROP TABLE IF EXISTS public.xp_transactions CASCADE;

-- 9. Remove XP columns from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS total_xp;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS current_level;

-- 10. Remove xp_earned column from action_logs
ALTER TABLE public.action_logs DROP COLUMN IF EXISTS xp_earned;

-- 11. Drop XP enum type
DROP TYPE IF EXISTS public.xp_action_type;

-- 12. Remove badge_earned and level_up from notification_type enum
-- (PostgreSQL doesn't support DROP VALUE from enum, so we recreate)
-- Clean up any existing badge/level notifications first
DELETE FROM public.notifications WHERE type::TEXT IN ('badge_earned', 'level_up');

ALTER TABLE public.notifications ALTER COLUMN type TYPE TEXT;
DROP TYPE IF EXISTS public.notification_type;
CREATE TYPE public.notification_type AS ENUM (
  'checkin_reminder',
  'teammate_action',
  'milestone_celebration',
  'streak_alert',
  'streak_broken',
  'goal_completed',
  'encourage',
  'comment',
  'group_invite',
  'member_joined'
);
ALTER TABLE public.notifications ALTER COLUMN type TYPE public.notification_type USING type::public.notification_type;
