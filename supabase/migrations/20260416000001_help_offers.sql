-- Add new enum values for help offers
ALTER TYPE public.group_activity_type ADD VALUE IF NOT EXISTS 'help_offered';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'help_offered';

-- Help offers table
CREATE TABLE public.help_offers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_goal_id   UUID NOT NULL REFERENCES public.sub_goals(id) ON DELETE CASCADE,
  offered_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id      UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  note          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_help_offers_sub_goal ON public.help_offers (sub_goal_id, created_at DESC);
CREATE INDEX idx_help_offers_group    ON public.help_offers (group_id, created_at DESC);

ALTER TABLE public.help_offers ENABLE ROW LEVEL SECURITY;

-- Group members can view help offers in their groups
CREATE POLICY "Group members can view help offers"
  ON public.help_offers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = help_offers.group_id
        AND gm.user_id = auth.uid()
    )
  );

-- Any group member can offer help
CREATE POLICY "Group members can offer help"
  ON public.help_offers FOR INSERT
  TO authenticated
  WITH CHECK (
    offered_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = help_offers.group_id
        AND gm.user_id = auth.uid()
    )
  );

ALTER TABLE public.help_offers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.help_offers;

-- ============================================================
-- Trigger: log help_offered to group_activities feed
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_help_offer_activity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_action_title TEXT;
  v_goal_id      UUID;
BEGIN
  SELECT sg.title, sg.goal_id
    INTO v_action_title, v_goal_id
    FROM public.sub_goals sg
   WHERE sg.id = NEW.sub_goal_id;

  INSERT INTO public.group_activities (group_id, user_id, type, goal_id, sub_goal_id, metadata)
  VALUES (
    NEW.group_id,
    NEW.offered_by,
    'help_offered',
    v_goal_id,
    NEW.sub_goal_id,
    jsonb_build_object('action_title', v_action_title, 'note', NEW.note)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_help_offer_activity
  AFTER INSERT ON public.help_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_help_offer_activity();

-- ============================================================
-- Trigger: notify the action owner (or goal creator) on help offer
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_help_offer_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_display_name TEXT;
  v_action_title TEXT;
  v_goal_id      UUID;
  v_notify_user  UUID;
BEGIN
  -- Get offerer display name
  SELECT p.display_name INTO v_display_name
    FROM public.profiles p
   WHERE p.id = NEW.offered_by;

  -- Get sub_goal info
  SELECT sg.title, sg.goal_id, sg.assigned_to
    INTO v_action_title, v_goal_id, v_notify_user
    FROM public.sub_goals sg
   WHERE sg.id = NEW.sub_goal_id;

  -- Fallback to goal creator if action is unassigned
  IF v_notify_user IS NULL THEN
    SELECT g.created_by INTO v_notify_user
      FROM public.goals g
     WHERE g.id = v_goal_id;
  END IF;

  -- Don't notify yourself
  IF v_notify_user IS NULL OR v_notify_user = NEW.offered_by THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_notify_user,
    'help_offered',
    '🤝 Someone offered to help!',
    COALESCE(v_display_name, 'Someone') || ' offered help on "' || COALESCE(v_action_title, 'an action') || '": ' || NEW.note,
    jsonb_build_object(
      'group_id', NEW.group_id,
      'goal_id', v_goal_id,
      'sub_goal_id', NEW.sub_goal_id,
      'help_offer_id', NEW.id,
      'from_user_id', NEW.offered_by
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_help_offer_notifications
  AFTER INSERT ON public.help_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_help_offer_notifications();
