-- ============================================================
-- Remove framework system: all goals are now SMART goals
-- ============================================================

-- 1. Drop the framework_type column from goals (all goals are SMART)
ALTER TABLE public.goals DROP COLUMN IF EXISTS framework_type;

-- 2. Drop the framework_type enum
DROP TYPE IF EXISTS public.framework_type;

-- 3. Simplify sub_goal_level to only 'milestone'
-- First update any existing sub_goals to use 'milestone'
UPDATE public.sub_goals SET level = 'milestone' WHERE level != 'milestone';

-- 4. Drop the frequency column from sub_goals (habit-specific)
ALTER TABLE public.sub_goals DROP COLUMN IF EXISTS frequency;

-- 5. Recreate sub_goal_level enum with only milestone
CREATE TYPE public.sub_goal_level_new AS ENUM ('milestone');
ALTER TABLE public.sub_goals
  ALTER COLUMN level TYPE public.sub_goal_level_new
  USING level::text::public.sub_goal_level_new;
DROP TYPE public.sub_goal_level;
ALTER TYPE public.sub_goal_level_new RENAME TO sub_goal_level;

-- 6. Clean up framework-specific XP action types
-- Remove deprecated action types from enum (keep the ones that still apply)
-- Note: PostgreSQL doesn't support removing enum values directly.
-- We must use CASCADE because award_xp() depends on the old type,
-- then recreate the function afterward.

-- Remap any rows using removed action types before we swap the enum
UPDATE public.xp_transactions
  SET action_type = 'action_logged'
  WHERE action_type::text IN ('okr_key_result_complete', 'habit_logged');

CREATE TYPE public.xp_action_type_new AS ENUM (
  'action_logged',
  'checkin_ontime',
  'encourage',
  'streak_3',
  'streak_7',
  'streak_30',
  'smart_milestone_complete',
  'goal_complete',
  'badge_earned'
);

ALTER TABLE public.xp_transactions
  ALTER COLUMN action_type TYPE public.xp_action_type_new
  USING action_type::text::public.xp_action_type_new;

-- CASCADE drops dependent functions (award_xp, etc.)
DROP TYPE public.xp_action_type CASCADE;
ALTER TYPE public.xp_action_type_new RENAME TO xp_action_type;

-- 7. Recreate award_xp (dropped by CASCADE above)
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
  SELECT current_level INTO v_old_level FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.xp_transactions (user_id, amount, action_type, source_id)
  VALUES (p_user_id, p_amount, p_action_type, p_source_id);

  UPDATE public.profiles
  SET total_xp = total_xp + p_amount,
      current_level = public.calculate_level(total_xp + p_amount),
      updated_at = now()
  WHERE id = p_user_id
  RETURNING total_xp, current_level INTO v_new_total, v_new_level;

  RETURN QUERY SELECT v_new_total, v_new_level, (v_new_level > v_old_level);
END;
$$;

-- 8. Recreate handle_sub_goal_completion with milestone-only logic
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
  IF NEW.status != 'completed' OR (OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  v_goal_id := NEW.goal_id;

  -- Award XP for milestone completion
  IF NEW.assigned_to IS NOT NULL THEN
    PERFORM public.award_xp(NEW.assigned_to, 25, 'smart_milestone_complete', NEW.id);
  END IF;

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

-- ============================================================
-- 9. Fix sub_goals RLS policies for personal goals
--    Original policies only allowed access via group_members join,
--    which fails when goal.group_id IS NULL (personal goals).
-- ============================================================

-- SELECT
DROP POLICY IF EXISTS "Group members can view sub-goals" ON public.sub_goals;
DROP POLICY IF EXISTS "Users can view sub-goals" ON public.sub_goals;
CREATE POLICY "Users can view sub-goals"
  ON public.sub_goals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.goals
      WHERE goals.id = sub_goals.goal_id
        AND (
          goals.created_by = auth.uid()
          OR public.is_group_member(goals.group_id, auth.uid())
        )
    )
  );

-- INSERT
DROP POLICY IF EXISTS "Group members can create sub-goals" ON public.sub_goals;
DROP POLICY IF EXISTS "Users can create sub-goals" ON public.sub_goals;
CREATE POLICY "Users can create sub-goals"
  ON public.sub_goals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.goals
      WHERE goals.id = sub_goals.goal_id
        AND (
          goals.created_by = auth.uid()
          OR public.is_group_member(goals.group_id, auth.uid())
        )
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "Assigned user or admin can update sub-goals" ON public.sub_goals;
DROP POLICY IF EXISTS "Assigned user or admin can update sub-goals" ON public.sub_goals;
CREATE POLICY "Assigned user or admin can update sub-goals"
  ON public.sub_goals FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.goals
      WHERE goals.id = sub_goals.goal_id
        AND (
          goals.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = goals.group_id
              AND group_members.user_id = auth.uid()
              AND group_members.role IN ('owner', 'admin')
          )
        )
    )
  );

-- DELETE
DROP POLICY IF EXISTS "Admin can delete sub-goals" ON public.sub_goals;
DROP POLICY IF EXISTS "Admin or owner can delete sub-goals" ON public.sub_goals;
CREATE POLICY "Admin or owner can delete sub-goals"
  ON public.sub_goals FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.goals
      WHERE goals.id = sub_goals.goal_id
        AND (
          goals.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = goals.group_id
              AND group_members.user_id = auth.uid()
              AND group_members.role IN ('owner', 'admin')
          )
        )
    )
  );
