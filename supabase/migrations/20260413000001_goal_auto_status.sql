-- ============================================================
-- Fix goal auto-completion: goals should only be 'completed' 
-- when ALL their top-level actions are completed, and should 
-- revert to 'active' if any action is un-completed.
-- ============================================================

-- 1. Update the sub_goal status change trigger to handle both directions
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

    -- Award XP for milestone completion
    IF NEW.assigned_to IS NOT NULL THEN
      PERFORM public.award_xp(NEW.assigned_to, 25, 'smart_milestone_complete', NEW.id);
    END IF;

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

      -- Award goal completion XP
      PERFORM public.award_xp(sg.assigned_to, 500, 'goal_complete', v_goal_id)
      FROM (
        SELECT DISTINCT assigned_to FROM public.sub_goals
        WHERE goal_id = v_goal_id AND assigned_to IS NOT NULL
      ) sg;
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

-- 2. Also update calculate_goal_progress to sync goal status with progress
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
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total, v_completed
  FROM public.sub_goals
  WHERE goal_id = p_goal_id AND parent_id IS NULL;

  IF v_total > 0 THEN
    v_progress := (v_completed::NUMERIC / v_total * 100);
  END IF;

  -- Update progress and sync status based on action completion
  UPDATE public.goals
  SET progress = v_progress,
      status = CASE
        WHEN v_total > 0 AND v_total = v_completed THEN 'completed'::public.goal_status
        WHEN status = 'completed' AND (v_total = 0 OR v_completed < v_total) THEN 'active'::public.goal_status
        ELSE status
      END,
      updated_at = now()
  WHERE id = p_goal_id;

  RETURN v_progress;
END;
$$;

-- 3. Fix any currently-mismarked goals: revert to active if not all actions are done
UPDATE public.goals g
SET status = 'active', updated_at = now()
WHERE g.status = 'completed'
  AND EXISTS (
    SELECT 1 FROM public.sub_goals s
    WHERE s.goal_id = g.id AND s.parent_id IS NULL AND s.status != 'completed'
  );

-- Also mark goals as completed if all actions are actually done but status is still active
UPDATE public.goals g
SET status = 'completed', updated_at = now()
WHERE g.status = 'active'
  AND (
    SELECT COUNT(*) FROM public.sub_goals s
    WHERE s.goal_id = g.id AND s.parent_id IS NULL
  ) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.sub_goals s
    WHERE s.goal_id = g.id AND s.parent_id IS NULL AND s.status != 'completed'
  );
