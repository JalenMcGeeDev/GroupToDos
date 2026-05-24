-- Trigger: increment streak_current + update last_action_date on the user's
-- profile whenever they save (or re-save) a daily_intention for TODAY.
--
-- This ensures the streak increments once per calendar day regardless of
-- whether the user logged any action_log rows during their check-in.
--
-- Guard: if last_action_date is already today the trigger is a no-op, so
-- re-saving the intention (e.g. editing text) never double-counts.

CREATE OR REPLACE FUNCTION public.handle_daily_intention_streak()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today        DATE := CURRENT_DATE;
  v_last_action  DATE;
  v_streak       INT;
  v_longest      INT;
  v_cadence      TEXT;
  v_cadence_days INT;
  v_days_since   INT;
  v_new_streak   INT;
BEGIN
  -- Only process intentions for today (ignore backdating)
  IF NEW.date <> v_today THEN
    RETURN NEW;
  END IF;

  -- Load the fields we need from the profile
  SELECT streak_current, streak_longest, last_action_date, checkin_cadence
    INTO v_streak, v_longest, v_last_action, v_cadence
    FROM public.profiles
   WHERE id = NEW.user_id;

  -- If already credited today, nothing to do
  IF v_last_action = v_today THEN
    RETURN NEW;
  END IF;

  -- Map cadence label → day count
  v_cadence_days := CASE v_cadence
    WHEN 'weekly'       THEN 7
    WHEN 'every_3_days' THEN 3
    WHEN 'every_2_days' THEN 2
    ELSE 1   -- 'daily' and any unrecognised value
  END;

  -- Decide whether the streak continues or resets
  IF v_last_action IS NULL THEN
    v_new_streak := 1;                             -- first ever check-in
  ELSE
    v_days_since := v_today - v_last_action;       -- integer subtraction of dates = day count
    IF v_days_since <= v_cadence_days THEN
      v_new_streak := v_streak + 1;                -- within window → extend streak
    ELSE
      v_new_streak := 1;                           -- window missed → start over
    END IF;
  END IF;

  -- Persist the updated streak
  UPDATE public.profiles
     SET streak_current  = v_new_streak,
         streak_longest  = GREATEST(v_new_streak, COALESCE(v_longest, 0)),
         last_action_date = v_today
   WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Attach to daily_intentions: fires after INSERT (new day) or UPDATE (re-save)
DROP TRIGGER IF EXISTS on_daily_intention_saved ON public.daily_intentions;
CREATE TRIGGER on_daily_intention_saved
  AFTER INSERT OR UPDATE OF date
  ON public.daily_intentions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_daily_intention_streak();
