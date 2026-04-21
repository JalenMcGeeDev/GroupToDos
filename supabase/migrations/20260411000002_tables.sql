-- ============================================================
-- TABLES for CoGoal
-- ============================================================

-- Enable pgcrypto for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------
-- Profiles (extends auth.users)
-- ----------------------------------------
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL DEFAULT '',
  avatar_url    TEXT,
  total_xp      INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  checkin_cadence public.checkin_cadence NOT NULL DEFAULT 'daily',
  streak_current INTEGER NOT NULL DEFAULT 0,
  streak_longest INTEGER NOT NULL DEFAULT 0,
  last_action_date DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------
-- Groups
-- ----------------------------------------
CREATE TABLE public.groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        public.group_type NOT NULL DEFAULT 'custom',
  description TEXT,
  invite_code TEXT UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(6), 'hex'),
  created_by  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_groups_invite_code ON public.groups(invite_code);

-- ----------------------------------------
-- Group Members (join table)
-- ----------------------------------------
CREATE TABLE public.group_members (
  group_id   UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       public.member_role NOT NULL DEFAULT 'member',
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX idx_group_members_user ON public.group_members(user_id);

-- ----------------------------------------
-- Goals
-- ----------------------------------------
CREATE TABLE public.goals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  framework_type   public.framework_type NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  status           public.goal_status NOT NULL DEFAULT 'active',
  start_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date         DATE,
  tangible_reward  TEXT,
  progress         NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  created_by       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goals_group ON public.goals(group_id);
CREATE INDEX idx_goals_status ON public.goals(status);

-- ----------------------------------------
-- Sub-Goals (hierarchical)
-- ----------------------------------------
CREATE TABLE public.sub_goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id       UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES public.sub_goals(id) ON DELETE CASCADE,
  assigned_to   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  level         public.sub_goal_level NOT NULL,
  status        public.sub_goal_status NOT NULL DEFAULT 'not_started',
  target_value  NUMERIC(12,2),
  current_value NUMERIC(12,2) DEFAULT 0,
  due_date      DATE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  -- Habit-specific fields
  frequency     public.habit_frequency,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_goals_goal ON public.sub_goals(goal_id);
CREATE INDEX idx_sub_goals_parent ON public.sub_goals(parent_id);
CREATE INDEX idx_sub_goals_assigned ON public.sub_goals(assigned_to);

-- ----------------------------------------
-- Action Logs
-- ----------------------------------------
CREATE TABLE public.action_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sub_goal_id   UUID NOT NULL REFERENCES public.sub_goals(id) ON DELETE CASCADE,
  note          TEXT,
  media_url     TEXT,
  value         NUMERIC(12,2) DEFAULT 1,
  xp_earned     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_logs_user ON public.action_logs(user_id);
CREATE INDEX idx_action_logs_sub_goal ON public.action_logs(sub_goal_id);
CREATE INDEX idx_action_logs_created ON public.action_logs(created_at DESC);

-- ----------------------------------------
-- XP Transactions (append-only ledger)
-- ----------------------------------------
CREATE TABLE public.xp_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  action_type public.xp_action_type NOT NULL,
  source_id   UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_xp_transactions_user ON public.xp_transactions(user_id);
CREATE INDEX idx_xp_transactions_created ON public.xp_transactions(created_at DESC);

-- ----------------------------------------
-- Badges (definitions)
-- ----------------------------------------
CREATE TABLE public.badges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  icon_name    TEXT NOT NULL DEFAULT 'star',
  criteria     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------
-- User Badges (earned instances)
-- ----------------------------------------
CREATE TABLE public.user_badges (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id  UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX idx_user_badges_user ON public.user_badges(user_id);

-- ----------------------------------------
-- Comments
-- ----------------------------------------
CREATE TABLE public.comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type  public.comment_target_type NOT NULL,
  target_id    UUID NOT NULL,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_target ON public.comments(target_type, target_id);
CREATE INDEX idx_comments_user ON public.comments(user_id);

-- ----------------------------------------
-- Notifications
-- ----------------------------------------
CREATE TABLE public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        public.notification_type NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  data        JSONB DEFAULT '{}',
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, read);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

-- ----------------------------------------
-- Encouragements (reactions)
-- ----------------------------------------
CREATE TABLE public.encouragements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_log_id  UUID NOT NULL REFERENCES public.action_logs(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(from_user_id, action_log_id)
);

CREATE INDEX idx_encouragements_action ON public.encouragements(action_log_id);

-- ----------------------------------------
-- Habit Logs (daily/weekly habit check-ins)
-- ----------------------------------------
CREATE TABLE public.habit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sub_goal_id  UUID NOT NULL REFERENCES public.sub_goals(id) ON DELETE CASCADE,
  log_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  completed    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, sub_goal_id, log_date)
);

CREATE INDEX idx_habit_logs_user_subgoal ON public.habit_logs(user_id, sub_goal_id);
CREATE INDEX idx_habit_logs_date ON public.habit_logs(log_date);

-- ----------------------------------------
-- Enable Realtime for key tables
-- ----------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.action_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.encouragements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sub_goals;
