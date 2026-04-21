-- Add new enum values for help requests
ALTER TYPE public.group_activity_type ADD VALUE IF NOT EXISTS 'help_requested';
ALTER TYPE public.group_activity_type ADD VALUE IF NOT EXISTS 'help_resolved';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'help_requested';

-- Help requests table
CREATE TABLE public.help_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_goal_id   UUID NOT NULL REFERENCES public.sub_goals(id) ON DELETE CASCADE,
  requested_by  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id      UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  note          TEXT NOT NULL,
  resolved      BOOLEAN NOT NULL DEFAULT false,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_help_requests_sub_goal ON public.help_requests (sub_goal_id, resolved);
CREATE INDEX idx_help_requests_group    ON public.help_requests (group_id, created_at DESC);

ALTER TABLE public.help_requests ENABLE ROW LEVEL SECURITY;

-- Group members can view help requests in their groups
CREATE POLICY "Group members can view help requests"
  ON public.help_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = help_requests.group_id
        AND gm.user_id = auth.uid()
    )
  );

-- Users can create help requests for sub_goals assigned to them
CREATE POLICY "Users can create own help requests"
  ON public.help_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sub_goals sg
      WHERE sg.id = help_requests.sub_goal_id
        AND sg.assigned_to = auth.uid()
    )
  );

-- Only the requester can update (resolve) their help request
CREATE POLICY "Requester can resolve help requests"
  ON public.help_requests FOR UPDATE
  TO authenticated
  USING (requested_by = auth.uid())
  WITH CHECK (requested_by = auth.uid());

ALTER TABLE public.help_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.help_requests;

-- ============================================================
-- Trigger: log help_requested to group_activities feed
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_help_request_activity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_action_title TEXT;
  v_goal_id      UUID;
BEGIN
  -- Get the sub_goal title and goal_id
  SELECT sg.title, sg.goal_id
    INTO v_action_title, v_goal_id
    FROM public.sub_goals sg
   WHERE sg.id = NEW.sub_goal_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.group_activities (group_id, user_id, type, goal_id, sub_goal_id, metadata)
    VALUES (
      NEW.group_id,
      NEW.requested_by,
      'help_requested',
      v_goal_id,
      NEW.sub_goal_id,
      jsonb_build_object('action_title', v_action_title, 'note', NEW.note)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.resolved = true AND OLD.resolved = false THEN
    INSERT INTO public.group_activities (group_id, user_id, type, goal_id, sub_goal_id, metadata)
    VALUES (
      NEW.group_id,
      NEW.requested_by,
      'help_resolved',
      v_goal_id,
      NEW.sub_goal_id,
      jsonb_build_object('action_title', v_action_title)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_help_request_activity
  AFTER INSERT OR UPDATE ON public.help_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_help_request_activity();

-- ============================================================
-- Trigger: create notifications for all group members on help request
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_help_request_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_display_name TEXT;
  v_action_title TEXT;
  v_goal_id      UUID;
  v_member       RECORD;
BEGIN
  -- Only on INSERT (new help request)
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Get requester display name
  SELECT p.display_name INTO v_display_name
    FROM public.profiles p
   WHERE p.id = NEW.requested_by;

  -- Get sub_goal info
  SELECT sg.title, sg.goal_id
    INTO v_action_title, v_goal_id
    FROM public.sub_goals sg
   WHERE sg.id = NEW.sub_goal_id;

  -- Notify every other group member
  FOR v_member IN
    SELECT gm.user_id
      FROM public.group_members gm
     WHERE gm.group_id = NEW.group_id
       AND gm.user_id <> NEW.requested_by
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_member.user_id,
      'help_requested',
      '🆘 Help needed!',
      COALESCE(v_display_name, 'Someone') || ' needs help with "' || COALESCE(v_action_title, 'an action') || '": ' || NEW.note,
      jsonb_build_object(
        'group_id', NEW.group_id,
        'goal_id', v_goal_id,
        'sub_goal_id', NEW.sub_goal_id,
        'help_request_id', NEW.id,
        'from_user_id', NEW.requested_by
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_help_request_notifications
  AFTER INSERT ON public.help_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_help_request_notifications();

-- ============================================================
-- Update get_group_activity_feed to handle new types
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_group_activity_feed(
  p_group_id UUID,
  p_limit    INT DEFAULT 50,
  p_offset   INT DEFAULT 0
)
RETURNS TABLE (
  id           UUID,
  type         TEXT,
  user_id      UUID,
  display_name TEXT,
  avatar_url   TEXT,
  title        TEXT,
  note         TEXT,
  media_url    TEXT,
  created_at   TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    ga.id,
    ga.type::TEXT,
    ga.user_id,
    p.display_name,
    p.avatar_url,
    CASE ga.type::TEXT
      WHEN 'action_completed'        THEN 'Completed "' || (ga.metadata->>'action_title') || '"'
      WHEN 'action_added'            THEN 'Added "' || (ga.metadata->>'action_title') || '"'
      WHEN 'action_due_date_changed' THEN 'Changed due date for "' || (ga.metadata->>'action_title') || '"'
      WHEN 'goal_created'            THEN 'Created goal "' || (ga.metadata->>'goal_title') || '"'
      WHEN 'goal_completed'          THEN 'Completed goal "' || (ga.metadata->>'goal_title') || '"'
      WHEN 'goal_shared'             THEN 'Shared goal "' || (ga.metadata->>'goal_title') || '"'
      WHEN 'member_joined'           THEN (ga.metadata->>'display_name') || ' joined the group'
      WHEN 'member_left'             THEN (ga.metadata->>'display_name') || ' left the group'
      WHEN 'help_requested'          THEN 'Asked for help on "' || (ga.metadata->>'action_title') || '"'
      WHEN 'help_resolved'           THEN 'Resolved help on "' || (ga.metadata->>'action_title') || '"'
      ELSE 'Activity'
    END AS title,
    CASE ga.type::TEXT
      WHEN 'help_requested' THEN ga.metadata->>'note'
      ELSE NULL
    END AS note,
    NULL::TEXT AS media_url,
    ga.created_at
  FROM public.group_activities ga
  JOIN public.profiles p ON p.id = ga.user_id
  WHERE ga.group_id = p_group_id
  ORDER BY ga.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;
