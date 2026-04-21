-- ============================================================
-- Group Activity Feed: stores all group-level events in a
-- single table, populated by triggers on relevant tables.
-- ============================================================

-- 1. Activity type enum
DO $$ BEGIN
  CREATE TYPE public.group_activity_type AS ENUM (
    'action_completed',
    'goal_created',
    'goal_completed',
    'goal_shared',
    'action_added',
    'action_due_date_changed',
    'member_joined',
    'member_left'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Group activity table
CREATE TABLE IF NOT EXISTS public.group_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        public.group_activity_type NOT NULL,
  goal_id     UUID REFERENCES public.goals(id) ON DELETE CASCADE,
  sub_goal_id UUID REFERENCES public.sub_goals(id) ON DELETE SET NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_group_activities_group   ON public.group_activities(group_id, created_at DESC);
CREATE INDEX idx_group_activities_goal    ON public.group_activities(goal_id);

ALTER TABLE public.group_activities ENABLE ROW LEVEL SECURITY;

-- RLS: members of the group can read
CREATE POLICY group_activities_select ON public.group_activities FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_activities.group_id AND gm.user_id = auth.uid()
  ));

-- RLS: insert via triggers (SECURITY DEFINER functions)
CREATE POLICY group_activities_insert ON public.group_activities FOR INSERT
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.group_activities;

-- 3. Helper: get all group_ids a goal belongs to (direct + shared)
CREATE OR REPLACE FUNCTION public.get_goal_group_ids(p_goal_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
AS $$
  SELECT array_agg(DISTINCT gid) FROM (
    SELECT group_id AS gid FROM public.goals WHERE id = p_goal_id AND group_id IS NOT NULL
    UNION ALL
    SELECT group_id AS gid FROM public.goal_group_shares WHERE goal_id = p_goal_id
  ) sub;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- 4a. Sub-goal completed → action_completed
--     Sub-goal created → action_added
--     Sub-goal due_date changed → action_due_date_changed
CREATE OR REPLACE FUNCTION public.trg_group_activity_sub_goal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_ids UUID[];
  v_user_id UUID;
  v_gid UUID;
BEGIN
  v_group_ids := public.get_goal_group_ids(NEW.goal_id);
  IF v_group_ids IS NULL THEN RETURN NEW; END IF;

  v_user_id := COALESCE(NEW.assigned_to, (SELECT created_by FROM public.goals WHERE id = NEW.goal_id));

  IF TG_OP = 'INSERT' THEN
    FOREACH v_gid IN ARRAY v_group_ids LOOP
      INSERT INTO public.group_activities (group_id, user_id, type, goal_id, sub_goal_id, metadata)
      VALUES (v_gid, v_user_id, 'action_added', NEW.goal_id, NEW.id,
              jsonb_build_object('action_title', NEW.title));
    END LOOP;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Action completed
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
      FOREACH v_gid IN ARRAY v_group_ids LOOP
        INSERT INTO public.group_activities (group_id, user_id, type, goal_id, sub_goal_id, metadata)
        VALUES (v_gid, v_user_id, 'action_completed', NEW.goal_id, NEW.id,
                jsonb_build_object('action_title', NEW.title));
      END LOOP;
    END IF;

    -- Due date changed
    IF NEW.due_date IS DISTINCT FROM OLD.due_date AND NEW.due_date IS NOT NULL THEN
      FOREACH v_gid IN ARRAY v_group_ids LOOP
        INSERT INTO public.group_activities (group_id, user_id, type, goal_id, sub_goal_id, metadata)
        VALUES (v_gid, v_user_id, 'action_due_date_changed', NEW.goal_id, NEW.id,
                jsonb_build_object('action_title', NEW.title, 'due_date', NEW.due_date::TEXT));
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_activity_sub_goal ON public.sub_goals;
CREATE TRIGGER trg_group_activity_sub_goal
  AFTER INSERT OR UPDATE ON public.sub_goals
  FOR EACH ROW EXECUTE FUNCTION public.trg_group_activity_sub_goal();

-- 4b. Goal created / completed
CREATE OR REPLACE FUNCTION public.trg_group_activity_goal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_ids UUID[];
  v_gid UUID;
BEGIN
  v_group_ids := public.get_goal_group_ids(NEW.id);
  IF v_group_ids IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    FOREACH v_gid IN ARRAY v_group_ids LOOP
      INSERT INTO public.group_activities (group_id, user_id, type, goal_id, metadata)
      VALUES (v_gid, NEW.created_by, 'goal_created', NEW.id,
              jsonb_build_object('goal_title', NEW.title));
    END LOOP;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
      FOREACH v_gid IN ARRAY v_group_ids LOOP
        INSERT INTO public.group_activities (group_id, user_id, type, goal_id, metadata)
        VALUES (v_gid, NEW.created_by, 'goal_completed', NEW.id,
                jsonb_build_object('goal_title', NEW.title));
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_activity_goal ON public.goals;
CREATE TRIGGER trg_group_activity_goal
  AFTER INSERT OR UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.trg_group_activity_goal();

-- 4c. Goal shared to group
CREATE OR REPLACE FUNCTION public.trg_group_activity_goal_shared()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_goal RECORD;
BEGIN
  SELECT id, title, created_by INTO v_goal FROM public.goals WHERE id = NEW.goal_id;
  IF v_goal IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.group_activities (group_id, user_id, type, goal_id, metadata)
  VALUES (NEW.group_id, v_goal.created_by, 'goal_shared', NEW.goal_id,
          jsonb_build_object('goal_title', v_goal.title));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_activity_goal_shared ON public.goal_group_shares;
CREATE TRIGGER trg_group_activity_goal_shared
  AFTER INSERT ON public.goal_group_shares
  FOR EACH ROW EXECUTE FUNCTION public.trg_group_activity_goal_shared();

-- 4d. Member joined / left
CREATE OR REPLACE FUNCTION public.trg_group_activity_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.group_activities (group_id, user_id, type, metadata)
    VALUES (NEW.group_id, NEW.user_id, 'member_joined',
            jsonb_build_object('display_name', COALESCE(v_name, 'Someone')));
  ELSIF TG_OP = 'DELETE' THEN
    SELECT display_name INTO v_name FROM public.profiles WHERE id = OLD.user_id;
    INSERT INTO public.group_activities (group_id, user_id, type, metadata)
    VALUES (OLD.group_id, OLD.user_id, 'member_left',
            jsonb_build_object('display_name', COALESCE(v_name, 'Someone')));
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_group_activity_member ON public.group_members;
CREATE TRIGGER trg_group_activity_member
  AFTER INSERT OR DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_group_activity_member();

-- 5. Replace the old feed function to use group_activities
DROP FUNCTION IF EXISTS public.get_group_activity_feed(UUID, INTEGER, INTEGER);
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
  SELECT
    ga.id,
    ga.type::TEXT,
    ga.user_id,
    p.display_name,
    p.avatar_url,
    CASE ga.type
      WHEN 'action_completed'       THEN 'Completed action: ' || (ga.metadata->>'action_title')
      WHEN 'goal_created'           THEN 'Created goal: '     || (ga.metadata->>'goal_title')
      WHEN 'goal_completed'         THEN 'Completed goal: '   || (ga.metadata->>'goal_title')
      WHEN 'goal_shared'            THEN 'Shared goal: '      || (ga.metadata->>'goal_title')
      WHEN 'action_added'           THEN 'Added action: '     || (ga.metadata->>'action_title')
      WHEN 'action_due_date_changed' THEN 'Set due date on: '  || (ga.metadata->>'action_title')
      WHEN 'member_joined'          THEN (ga.metadata->>'display_name') || ' joined the group'
      WHEN 'member_left'            THEN (ga.metadata->>'display_name') || ' left the group'
    END AS title,
    NULL::TEXT AS note,
    NULL::TEXT AS media_url,
    0::INTEGER AS xp_earned,
    ga.created_at
  FROM public.group_activities ga
  JOIN public.profiles p ON p.id = ga.user_id
  WHERE ga.group_id = p_group_id
  ORDER BY ga.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
