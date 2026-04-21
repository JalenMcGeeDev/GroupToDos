-- ============================================================
-- ENUMS for CoGoal
-- ============================================================

-- Group types
CREATE TYPE public.group_type AS ENUM ('couple', 'friends', 'family', 'custom');

-- Goal framework types
CREATE TYPE public.framework_type AS ENUM ('quarterly', 'okr', 'smart', 'habit');

-- Goal status
CREATE TYPE public.goal_status AS ENUM ('active', 'completed', 'archived');

-- Sub-goal hierarchy level
CREATE TYPE public.sub_goal_level AS ENUM (
  'quarter', 'month', 'week',          -- quarterly cascading
  'key_result',                         -- OKR
  'milestone',                          -- SMART
  'habit'                               -- habit tracking
);

-- Sub-goal status
CREATE TYPE public.sub_goal_status AS ENUM ('not_started', 'in_progress', 'completed', 'missed');

-- XP action types
CREATE TYPE public.xp_action_type AS ENUM (
  'action_logged',
  'checkin_ontime',
  'weekly_complete',
  'encourage',
  'streak_3',
  'streak_7',
  'streak_30',
  'monthly_complete',
  'quarterly_complete',
  'okr_key_result_complete',
  'smart_milestone_complete',
  'habit_logged',
  'goal_complete',
  'badge_earned'
);

-- Group member roles
CREATE TYPE public.member_role AS ENUM ('owner', 'admin', 'member');

-- Comment target types
CREATE TYPE public.comment_target_type AS ENUM ('action_log', 'goal', 'sub_goal');

-- Notification types
CREATE TYPE public.notification_type AS ENUM (
  'checkin_reminder',
  'teammate_action',
  'milestone_celebration',
  'streak_alert',
  'streak_broken',
  'badge_earned',
  'level_up',
  'goal_completed',
  'encourage',
  'comment',
  'group_invite',
  'member_joined'
);

-- Check-in cadence options
CREATE TYPE public.checkin_cadence AS ENUM ('daily', 'every_2_days', 'every_3_days', 'weekly');

-- Habit frequency
CREATE TYPE public.habit_frequency AS ENUM ('daily', 'weekly');
