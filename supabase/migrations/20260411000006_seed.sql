-- ============================================================
-- SEED DATA for CoGoal
-- ============================================================

-- ----------------------------------------
-- Badge Definitions
-- ----------------------------------------
INSERT INTO public.badges (key, name, description, icon_name, criteria) VALUES
  ('streak_master', 'Streak Master', 'Maintain a 30-day streak', 'flame', '{"type": "streak", "days": 30}'),
  ('team_player', 'Team Player', 'Encourage teammates 50 times', 'heart', '{"type": "encouragements_sent", "count": 50}'),
  ('goal_crusher', 'Goal Crusher', 'Complete 5 goals', 'trophy', '{"type": "goals_completed", "count": 5}'),
  ('early_bird', 'Early Bird', 'Check in within the first hour of your cadence 10 times', 'sunrise', '{"type": "early_checkins", "count": 10}'),
  ('framework_explorer', 'Framework Explorer', 'Complete at least one goal in each framework', 'compass', '{"type": "frameworks_used", "count": 4}'),
  ('first_step', 'First Step', 'Log your first action', 'footprints', '{"type": "actions_logged", "count": 1}'),
  ('dedicated', 'Dedicated', 'Log 100 actions', 'medal', '{"type": "actions_logged", "count": 100}'),
  ('week_warrior', 'Week Warrior', 'Maintain a 7-day streak', 'zap', '{"type": "streak", "days": 7}'),
  ('centurion', 'Centurion', 'Reach level 10', 'award', '{"type": "level_reached", "level": 10}'),
  ('master', 'Master', 'Reach level 25', 'crown', '{"type": "level_reached", "level": 25}'),
  ('legend', 'Legend', 'Reach level 50', 'star', '{"type": "level_reached", "level": 50}'),
  ('social_butterfly', 'Social Butterfly', 'Be a member of 5 groups', 'users', '{"type": "groups_joined", "count": 5}'),
  ('perfectionist', 'Perfectionist', 'Complete a goal at 100% progress', 'check-circle', '{"type": "perfect_goal", "count": 1}'),
  ('habit_former', 'Habit Former', 'Complete a habit tracking goal', 'repeat', '{"type": "habit_goal_completed", "count": 1}')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------
-- XP Configuration (stored as a simple reference)
-- This documents the XP values used in the trigger/function logic
-- ----------------------------------------
COMMENT ON FUNCTION public.award_xp IS 'XP Values:
  action_logged: 10 XP
  checkin_ontime: 5 XP
  weekly_complete: 25 XP
  encourage: 3 XP
  streak_3: 15 XP
  streak_7: 40 XP
  streak_30: 200 XP
  monthly_complete: 75 XP
  quarterly_complete / goal_complete: 500 XP
  okr_key_result_complete: 25 XP
  smart_milestone_complete: 25 XP
  habit_logged: 5 XP';
