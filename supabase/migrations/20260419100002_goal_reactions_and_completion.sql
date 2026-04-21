-- ============================================================
-- Goal Reactions system + Goal completion notifications
-- ============================================================

-- 1. Add new enum values
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'goal_reaction';
ALTER TYPE public.group_activity_type ADD VALUE IF NOT EXISTS 'goal_reaction';

-- 2. Create goal_reactions table
CREATE TABLE public.goal_reactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id        UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type  TEXT NOT NULL,  -- emoji char (e.g. '🔥') or lottie key (e.g. 'good_luck')
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  push_sent      BOOLEAN NOT NULL DEFAULT false,  -- tracks whether push digest has been sent
  UNIQUE(goal_id, user_id, reaction_type)
);

CREATE INDEX idx_goal_reactions_goal ON public.goal_reactions(goal_id);
CREATE INDEX idx_goal_reactions_unsent ON public.goal_reactions(push_sent, created_at) WHERE NOT push_sent;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.goal_reactions;

-- 3. RLS policies
ALTER TABLE public.goal_reactions ENABLE ROW LEVEL SECURITY;

-- Users can view reactions on goals in their groups
CREATE POLICY "Group members can view reactions"
  ON public.goal_reactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.goals g
      JOIN public.group_members gm ON gm.group_id = g.group_id
      WHERE g.id = goal_reactions.goal_id
        AND gm.user_id = auth.uid()
    )
  );

-- Users can insert reactions on goals in their groups (not their own goals enforced client-side)
CREATE POLICY "Group members can react to goals"
  ON public.goal_reactions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.goals g
      JOIN public.group_members gm ON gm.group_id = g.group_id
      WHERE g.id = goal_reactions.goal_id
        AND gm.user_id = auth.uid()
    )
  );

-- Users can delete their own reactions
CREATE POLICY "Users can remove own reactions"
  ON public.goal_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Trigger: reaction → activity feed + in-app notification for goal owner
CREATE OR REPLACE FUNCTION public.handle_goal_reaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_goal       RECORD;
  v_reactor    TEXT;
BEGIN
  -- Get goal info
  SELECT id, group_id, title, created_by
    INTO v_goal
    FROM public.goals
   WHERE id = NEW.goal_id;

  -- Get reactor name
  SELECT display_name INTO v_reactor
    FROM public.profiles
   WHERE id = NEW.user_id;

  -- Insert activity feed entry (only if goal has a group)
  IF v_goal.group_id IS NOT NULL THEN
    INSERT INTO public.group_activities (group_id, user_id, type, goal_id, metadata)
    VALUES (
      v_goal.group_id,
      NEW.user_id,
      'goal_reaction',
      NEW.goal_id,
      jsonb_build_object(
        'reaction_type', NEW.reaction_type,
        'reactor_name', v_reactor,
        'goal_title', v_goal.title
      )
    );
  END IF;

  -- Create in-app notification for goal owner (skip self-reactions)
  IF v_goal.created_by != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_goal.created_by,
      'goal_reaction',
      v_reactor || ' reacted to your goal',
      'Reacted with ' || NEW.reaction_type || ' on "' || v_goal.title || '"',
      jsonb_build_object(
        'goal_id', NEW.goal_id,
        'group_id', v_goal.group_id,
        'from_user_id', NEW.user_id,
        'reaction_type', NEW.reaction_type
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_goal_reaction_created
  AFTER INSERT ON public.goal_reactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_goal_reaction();

-- 5. Trigger: goal completion → notify all group members
CREATE OR REPLACE FUNCTION public.handle_goal_completed_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_completer_name TEXT;
  v_member         RECORD;
BEGIN
  -- Only fire when status changes from active to completed
  IF OLD.status = 'active' AND NEW.status = 'completed' AND NEW.group_id IS NOT NULL THEN

    SELECT display_name INTO v_completer_name
      FROM public.profiles
     WHERE id = NEW.created_by;

    -- Notify every group member except the completer
    FOR v_member IN
      SELECT user_id FROM public.group_members
       WHERE group_id = NEW.group_id
         AND user_id != NEW.created_by
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_member.user_id,
        'goal_completed',
        '🎉 Goal completed!',
        COALESCE(v_completer_name, 'Someone') || ' completed "' || NEW.title || '"',
        jsonb_build_object(
          'goal_id', NEW.id,
          'group_id', NEW.group_id,
          'completer_id', NEW.created_by,
          'goal_title', NEW.title
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_goal_completed
  AFTER UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.handle_goal_completed_notify();
