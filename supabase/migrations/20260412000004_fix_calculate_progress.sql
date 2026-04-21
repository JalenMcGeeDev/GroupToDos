-- ============================================================
-- Fix calculate_goal_progress: remove framework_type reference
-- The old function references public.framework_type which was dropped.
-- All goals are now SMART, so just count milestones.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_goal_progress(p_goal_id UUID)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_progress NUMERIC(5,2) := 0;
  v_total INTEGER;
  v_completed INTEGER;
BEGIN
  -- All goals use milestone-based progress
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total, v_completed
  FROM public.sub_goals
  WHERE goal_id = p_goal_id AND parent_id IS NULL;

  IF v_total > 0 THEN
    v_progress := (v_completed::NUMERIC / v_total * 100);
  END IF;

  -- Update the goal progress
  UPDATE public.goals SET progress = v_progress, updated_at = now() WHERE id = p_goal_id;

  RETURN v_progress;
END;
$$;
