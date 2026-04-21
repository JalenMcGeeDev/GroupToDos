-- Rewrite check_and_update_streak to use cadence-aligned windows
-- instead of hard-coded 1-day logic.
--
-- Streak rules:
--   gap = 0                → no change (already logged today)
--   gap <= cadence_days    → increment streak (within window)
--   gap > cadence_days     → reset streak to 1 (missed window, no grace)
--   last_action_date NULL  → first action ever, streak = 1

DROP FUNCTION IF EXISTS public.check_and_update_streak(UUID);

CREATE OR REPLACE FUNCTION public.check_and_update_streak(p_user_id UUID)
RETURNS TABLE(current_streak INTEGER, streak_bonus INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_action DATE;
  v_today       DATE := CURRENT_DATE;
  v_streak      INTEGER;
  v_cadence     public.checkin_cadence;
  v_cadence_days INTEGER;
  v_gap         INTEGER;
BEGIN
  -- Get current streak info + cadence
  SELECT p.streak_current, p.last_action_date, p.checkin_cadence
  INTO v_streak, v_last_action, v_cadence
  FROM public.profiles p WHERE p.id = p_user_id;

  -- Map cadence enum to number of days
  v_cadence_days := CASE v_cadence
    WHEN 'daily'       THEN 1
    WHEN 'every_2_days' THEN 2
    WHEN 'every_3_days' THEN 3
    WHEN 'weekly'       THEN 7
    ELSE 1
  END;

  -- First action ever
  IF v_last_action IS NULL THEN
    v_streak := 1;
  ELSE
    v_gap := v_today - v_last_action;

    IF v_gap = 0 THEN
      -- Already logged today — no change
      current_streak := v_streak;
      streak_bonus := 0;
      RETURN NEXT;
      RETURN;
    ELSIF v_gap <= v_cadence_days THEN
      -- Within the cadence window — extend streak
      v_streak := v_streak + 1;
    ELSE
      -- Missed the window — reset streak
      v_streak := 1;
    END IF;
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET streak_current  = v_streak,
      streak_longest  = GREATEST(streak_longest, v_streak),
      last_action_date = v_today,
      updated_at       = now()
  WHERE id = p_user_id;

  current_streak := v_streak;
  streak_bonus   := 0;
  RETURN NEXT;
END;
$$;
