-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- ----------------------------------------
-- Enable RLS on all tables
-- ----------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encouragements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;

-- ========================================
-- PROFILES
-- ========================================

-- Users can read any profile (needed for group member display)
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can update only their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Profile insert is handled by trigger (see triggers migration)
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ========================================
-- GROUPS
-- ========================================

-- Members can view groups they belong to
CREATE POLICY "Group members can view group"
  ON public.groups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = groups.id
        AND group_members.user_id = auth.uid()
    )
  );

-- Any authenticated user can view a group by invite code (for joining)
CREATE POLICY "Anyone can view group by invite code"
  ON public.groups FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can create groups
CREATE POLICY "Authenticated users can create groups"
  ON public.groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Only owner/admin can update group
CREATE POLICY "Group owner/admin can update group"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = groups.id
        AND group_members.user_id = auth.uid()
        AND group_members.role IN ('owner', 'admin')
    )
  );

-- Only owner can delete group
CREATE POLICY "Group owner can delete group"
  ON public.groups FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- ========================================
-- GROUP MEMBERS
-- ========================================

-- Members can see other members in their groups
CREATE POLICY "Members can view group members"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members AS gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
    )
  );

-- Users can join groups (insert themselves)
CREATE POLICY "Users can join groups"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can leave groups (delete themselves), owners can remove members
CREATE POLICY "Users can leave or owners can remove"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_members AS gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'owner'
    )
  );

-- ========================================
-- GOALS
-- ========================================

-- Group members can view goals
CREATE POLICY "Group members can view goals"
  ON public.goals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = goals.group_id
        AND group_members.user_id = auth.uid()
    )
  );

-- Group members can create goals
CREATE POLICY "Group members can create goals"
  ON public.goals FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = goals.group_id
        AND group_members.user_id = auth.uid()
    )
  );

-- Goal creator or group owner/admin can update goals
CREATE POLICY "Goal creator or admin can update goals"
  ON public.goals FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = goals.group_id
        AND group_members.user_id = auth.uid()
        AND group_members.role IN ('owner', 'admin')
    )
  );

-- Goal creator or group owner can delete goals
CREATE POLICY "Goal creator or owner can delete goals"
  ON public.goals FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = goals.group_id
        AND group_members.user_id = auth.uid()
        AND group_members.role = 'owner'
    )
  );

-- ========================================
-- SUB-GOALS
-- ========================================

-- Group members can view sub-goals for their goals
CREATE POLICY "Group members can view sub-goals"
  ON public.sub_goals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.goals
      JOIN public.group_members ON group_members.group_id = goals.group_id
      WHERE goals.id = sub_goals.goal_id
        AND group_members.user_id = auth.uid()
    )
  );

-- Group members can create sub-goals
CREATE POLICY "Group members can create sub-goals"
  ON public.sub_goals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.goals
      JOIN public.group_members ON group_members.group_id = goals.group_id
      WHERE goals.id = sub_goals.goal_id
        AND group_members.user_id = auth.uid()
    )
  );

-- Assigned user or goal creator can update sub-goals
CREATE POLICY "Assigned user or admin can update sub-goals"
  ON public.sub_goals FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.goals
      JOIN public.group_members ON group_members.group_id = goals.group_id
      WHERE goals.id = sub_goals.goal_id
        AND group_members.user_id = auth.uid()
        AND group_members.role IN ('owner', 'admin')
    )
  );

-- Goal creator or admin can delete sub-goals
CREATE POLICY "Admin can delete sub-goals"
  ON public.sub_goals FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.goals
      JOIN public.group_members ON group_members.group_id = goals.group_id
      WHERE goals.id = sub_goals.goal_id
        AND group_members.user_id = auth.uid()
        AND group_members.role IN ('owner', 'admin')
    )
  );

-- ========================================
-- ACTION LOGS
-- ========================================

-- Group members can view action logs for their goals
CREATE POLICY "Group members can view action logs"
  ON public.action_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sub_goals
      JOIN public.goals ON goals.id = sub_goals.goal_id
      JOIN public.group_members ON group_members.group_id = goals.group_id
      WHERE sub_goals.id = action_logs.sub_goal_id
        AND group_members.user_id = auth.uid()
    )
  );

-- Users can create their own action logs
CREATE POLICY "Users can create own action logs"
  ON public.action_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- XP TRANSACTIONS
-- ========================================

-- Users can view their own XP transactions
CREATE POLICY "Users can view own XP transactions"
  ON public.xp_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- XP insert is handled by database functions (service role), but allow user insert for edge functions
CREATE POLICY "System can insert XP transactions"
  ON public.xp_transactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ========================================
-- BADGES
-- ========================================

-- Everyone can view badge definitions
CREATE POLICY "Badges are viewable by all"
  ON public.badges FOR SELECT
  TO authenticated
  USING (true);

-- ========================================
-- USER BADGES
-- ========================================

-- Anyone can view earned badges (for profiles)
CREATE POLICY "User badges are viewable by all"
  ON public.user_badges FOR SELECT
  TO authenticated
  USING (true);

-- System inserts badges (via functions)
CREATE POLICY "System can insert user badges"
  ON public.user_badges FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ========================================
-- COMMENTS
-- ========================================

-- Group members can view comments on their goals/actions
CREATE POLICY "Group members can view comments"
  ON public.comments FOR SELECT
  TO authenticated
  USING (true);

-- Users can create comments
CREATE POLICY "Users can create comments"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
  ON public.comments FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ========================================
-- NOTIFICATIONS
-- ========================================

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own notifications (mark read)
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- System inserts notifications
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ========================================
-- ENCOURAGEMENTS
-- ========================================

-- Group members can view encouragements
CREATE POLICY "Group members can view encouragements"
  ON public.encouragements FOR SELECT
  TO authenticated
  USING (true);

-- Users can send encouragements
CREATE POLICY "Users can send encouragements"
  ON public.encouragements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user_id AND from_user_id != to_user_id);

-- ========================================
-- HABIT LOGS
-- ========================================

-- Group members can view habit logs for their goals
CREATE POLICY "Group members can view habit logs"
  ON public.habit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sub_goals
      JOIN public.goals ON goals.id = sub_goals.goal_id
      JOIN public.group_members ON group_members.group_id = goals.group_id
      WHERE sub_goals.id = habit_logs.sub_goal_id
        AND group_members.user_id = auth.uid()
    )
  );

-- Users can create their own habit logs
CREATE POLICY "Users can create own habit logs"
  ON public.habit_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own habit logs
CREATE POLICY "Users can update own habit logs"
  ON public.habit_logs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
