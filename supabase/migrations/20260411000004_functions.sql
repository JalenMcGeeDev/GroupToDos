-- ============================================================
-- DATABASE FUNCTIONS for CoGoal
-- ============================================================

-- ----------------------------------------
-- Calculate level from total XP
-- Uses exponential curve: level N requires N^2 * 100 total XP
-- Level 1: 0 XP, Level 2: 400 XP, Level 5: 2500 XP, Level 10: 10000 XP
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_level(p_total_xp INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_total_xp <= 0 THEN
    RETURN 1;
  END IF;
  -- Level = floor(sqrt(total_xp / 100)) + 1, minimum 1
  RETURN GREATEST(1, FLOOR(SQRT(p_total_xp::NUMERIC / 100)) + 1)::INTEGER;
END;
$$;

-- ----------------------------------------
-- Award XP to a user
-- Inserts XP transaction and updates profile
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.award_xp(
  p_user_id UUID,
  p_amount INTEGER,
  p_action_type public.xp_action_type,
  p_source_id UUID DEFAULT NULL
)
RETURNS TABLE(new_total_xp INTEGER, new_level INTEGER, leveled_up BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_level INTEGER;
  v_new_total INTEGER;
  v_new_level INTEGER;
BEGIN
  -- Get current level
  SELECT current_level INTO v_old_level FROM public.profiles WHERE id = p_user_id;

  -- Insert XP transaction
  INSERT INTO public.xp_transactions (user_id, amount, action_type, source_id)
  VALUES (p_user_id, p_amount, p_action_type, p_source_id);

  -- Update profile total XP
  UPDATE public.profiles
  SET total_xp = total_xp + p_amount,
      current_level = public.calculate_level(total_xp + p_amount),
      updated_at = now()
  WHERE id = p_user_id
  RETURNING total_xp, current_level INTO v_new_total, v_new_level;

  RETURN QUERY SELECT v_new_total, v_new_level, (v_new_level > v_old_level);
END;
$$;

-- ----------------------------------------
-- Check and update streaks for a user
-- Call after logging an action
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.check_and_update_streak(p_user_id UUID)
RETURNS TABLE(current_streak INTEGER, streak_bonus_xp INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_action DATE;
  v_today DATE := CURRENT_DATE;
  v_streak INTEGER;
  v_bonus INTEGER := 0;
BEGIN
  -- Get current streak info
  SELECT p.streak_current, p.last_action_date
  INTO v_streak, v_last_action
  FROM public.profiles p WHERE p.id = p_user_id;

  IF v_last_action IS NULL OR v_last_action < v_today - INTERVAL '1 day' THEN
    -- Streak broken or first action ever
    v_streak := 1;
  ELSIF v_last_action = v_today - INTERVAL '1 day' THEN
    -- Consecutive day - increment streak
    v_streak := v_streak + 1;
  ELSIF v_last_action = v_today THEN
    -- Same day - no change
    -- Just return current values
    current_streak := v_streak;
    streak_bonus_xp := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Check streak milestones and award bonus XP
  IF v_streak = 3 THEN
    v_bonus := 15;
    PERFORM public.award_xp(p_user_id, 15, 'streak_3');
  ELSIF v_streak = 7 THEN
    v_bonus := 40;
    PERFORM public.award_xp(p_user_id, 40, 'streak_7');
  ELSIF v_streak = 30 THEN
    v_bonus := 200;
    PERFORM public.award_xp(p_user_id, 200, 'streak_30');
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET streak_current = v_streak,
      streak_longest = GREATEST(streak_longest, v_streak),
      last_action_date = v_today,
      updated_at = now()
  WHERE id = p_user_id;

  current_streak := v_streak;
  streak_bonus_xp := v_bonus;
  RETURN NEXT;
END;
$$;

-- ----------------------------------------
-- Calculate goal progress based on framework type
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_goal_progress(p_goal_id UUID)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_framework public.framework_type;
  v_progress NUMERIC(5,2) := 0;
  v_total INTEGER;
  v_completed INTEGER;
BEGIN
  SELECT framework_type INTO v_framework FROM public.goals WHERE id = p_goal_id;

  CASE v_framework
    WHEN 'quarterly' THEN
      -- Progress = % of all leaf-level (week) sub-goals completed
      SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
      INTO v_total, v_completed
      FROM public.sub_goals
      WHERE goal_id = p_goal_id AND level = 'week';

      IF v_total > 0 THEN
        v_progress := (v_completed::NUMERIC / v_total * 100);
      END IF;

    WHEN 'okr' THEN
      -- Progress = average of key result percentages
      SELECT COALESCE(AVG(
        CASE WHEN target_value > 0 THEN LEAST(current_value / target_value * 100, 100)
        ELSE 0 END
      ), 0)
      INTO v_progress
      FROM public.sub_goals
      WHERE goal_id = p_goal_id AND level = 'key_result';

    WHEN 'smart' THEN
      -- Progress = % of milestones completed
      SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
      INTO v_total, v_completed
      FROM public.sub_goals
      WHERE goal_id = p_goal_id AND level = 'milestone';

      IF v_total > 0 THEN
        v_progress := (v_completed::NUMERIC / v_total * 100);
      END IF;

    WHEN 'habit' THEN
      -- Progress = % of habit logs completed in the period
      SELECT COUNT(*), COUNT(*) FILTER (WHERE completed = true)
      INTO v_total, v_completed
      FROM public.habit_logs hl
      JOIN public.sub_goals sg ON sg.id = hl.sub_goal_id
      WHERE sg.goal_id = p_goal_id;

      IF v_total > 0 THEN
        v_progress := (v_completed::NUMERIC / v_total * 100);
      END IF;
  END CASE;

  -- Update the goal progress
  UPDATE public.goals SET progress = v_progress, updated_at = now() WHERE id = p_goal_id;

  RETURN v_progress;
END;
$$;

-- ----------------------------------------
-- Get group leaderboard for current goal period
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_group_leaderboard(p_group_id UUID)
RETURNS TABLE(
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  period_xp BIGINT,
  total_xp INTEGER,
  current_level INTEGER,
  rank BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period_start TIMESTAMPTZ;
BEGIN
  -- Get the earliest active goal start date in the group as the period start
  SELECT COALESCE(MIN(g.start_date)::TIMESTAMPTZ, now() - INTERVAL '90 days')
  INTO v_period_start
  FROM public.goals g
  WHERE g.group_id = p_group_id AND g.status = 'active';

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.display_name,
    p.avatar_url,
    COALESCE(SUM(xt.amount), 0)::BIGINT AS period_xp,
    p.total_xp,
    p.current_level,
    ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(xt.amount), 0) DESC)::BIGINT AS rank
  FROM public.group_members gm
  JOIN public.profiles p ON p.id = gm.user_id
  LEFT JOIN public.xp_transactions xt ON xt.user_id = p.id AND xt.created_at >= v_period_start
  WHERE gm.group_id = p_group_id
  GROUP BY p.id, p.display_name, p.avatar_url, p.total_xp, p.current_level
  ORDER BY period_xp DESC;
END;
$$;

-- ----------------------------------------
-- Get activity feed for a group
-- ----------------------------------------
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
  xp_earned INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  -- Action logs
  SELECT
    al.id,
    'action_log'::TEXT AS type,
    al.user_id,
    p.display_name,
    p.avatar_url,
    sg.title,
    al.note,
    al.media_url,
    al.xp_earned,
    al.created_at
  FROM public.action_logs al
  JOIN public.profiles p ON p.id = al.user_id
  JOIN public.sub_goals sg ON sg.id = al.sub_goal_id
  JOIN public.goals g ON g.id = sg.goal_id
  WHERE g.group_id = p_group_id
  ORDER BY al.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ----------------------------------------
-- Join a group by invite code
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.join_group_by_invite_code(p_invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_id UUID;
BEGIN
  -- Find group by invite code
  SELECT id INTO v_group_id FROM public.groups WHERE invite_code = p_invite_code;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = v_group_id AND user_id = auth.uid()
  ) THEN
    RETURN v_group_id; -- Already a member, just return group id
  END IF;

  -- Add as member
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group_id, auth.uid(), 'member');

  RETURN v_group_id;
END;
$$;
