-- Add last_action_at column to goals for fire animation recency decay
ALTER TABLE public.goals
  ADD COLUMN last_action_at TIMESTAMPTZ;

-- Trigger function: update goals.last_action_at when an action is logged
CREATE OR REPLACE FUNCTION public.update_goal_last_action_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_goal_id UUID;
BEGIN
  SELECT goal_id INTO v_goal_id
  FROM public.sub_goals
  WHERE id = NEW.sub_goal_id;

  IF v_goal_id IS NOT NULL THEN
    UPDATE public.goals
    SET last_action_at = now()
    WHERE id = v_goal_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Fire trigger on every action_logs insert
CREATE TRIGGER trg_update_goal_last_action_at
  AFTER INSERT ON public.action_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_goal_last_action_at();

-- Backfill existing goals from historical action_logs
UPDATE public.goals g
SET last_action_at = sub.max_at
FROM (
  SELECT sg.goal_id, MAX(al.created_at) AS max_at
  FROM public.action_logs al
  JOIN public.sub_goals sg ON sg.id = al.sub_goal_id
  GROUP BY sg.goal_id
) sub
WHERE g.id = sub.goal_id;
