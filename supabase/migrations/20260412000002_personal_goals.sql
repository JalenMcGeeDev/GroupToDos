-- ============================================================
-- MIGRATION: Personal Goals & Goal-Group Sharing
-- Goals become personal-first (group_id nullable).
-- A new join table allows sharing goals to multiple groups.
-- ============================================================

-- 1. Make group_id nullable on goals (personal goals have no group)
ALTER TABLE public.goals ALTER COLUMN group_id DROP NOT NULL;

-- 2. Create goal_group_shares join table (many-to-many)
CREATE TABLE public.goal_group_shares (
  goal_id    UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  shared_by  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_id, group_id)
);

CREATE INDEX idx_goal_group_shares_group ON public.goal_group_shares(group_id);
CREATE INDEX idx_goal_group_shares_goal ON public.goal_group_shares(goal_id);

-- 3. Enable RLS
ALTER TABLE public.goal_group_shares ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for goal_group_shares

-- Group members can view shares for their groups
CREATE POLICY "Group members can view goal shares"
  ON public.goal_group_shares FOR SELECT
  TO authenticated
  USING (
    public.is_group_member(group_id, auth.uid())
  );

-- Goal owner can share to groups they belong to
CREATE POLICY "Goal owner can share to groups"
  ON public.goal_group_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    shared_by = auth.uid()
    AND public.is_group_member(group_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.goals
      WHERE goals.id = goal_id
        AND goals.created_by = auth.uid()
    )
  );

-- Goal owner can unshare
CREATE POLICY "Goal owner can unshare from groups"
  ON public.goal_group_shares FOR DELETE
  TO authenticated
  USING (
    shared_by = auth.uid()
  );

-- 5. Update goals SELECT policy to allow viewing personal goals
--    (user can always see their own goals)
CREATE POLICY "Users can view own goals"
  ON public.goals FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- 6. Allow viewing goals shared to user's groups
CREATE POLICY "Users can view goals shared to their groups"
  ON public.goals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.goal_group_shares gs
      WHERE gs.goal_id = goals.id
        AND public.is_group_member(gs.group_id, auth.uid())
    )
  );

-- 7. Update goals INSERT to allow personal goals (no group_id)
DROP POLICY IF EXISTS "Group members can create goals" ON public.goals;
CREATE POLICY "Users can create goals"
  ON public.goals FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND (
      group_id IS NULL
      OR public.is_group_member(group_id, auth.uid())
    )
  );

-- 8. Update goals UPDATE policy to include personal goals
DROP POLICY IF EXISTS "Goal creator or admin can update goals" ON public.goals;
CREATE POLICY "Goal creator or admin can update goals"
  ON public.goals FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      group_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = goals.group_id
          AND group_members.user_id = auth.uid()
          AND group_members.role IN ('owner', 'admin')
      )
    )
  );

-- 9. Update goals DELETE policy to include personal goals
DROP POLICY IF EXISTS "Goal creator or owner can delete goals" ON public.goals;
CREATE POLICY "Goal creator or owner can delete goals"
  ON public.goals FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      group_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = goals.group_id
          AND group_members.user_id = auth.uid()
          AND group_members.role = 'owner'
      )
    )
  );

-- 10. Enable realtime on shares table
ALTER PUBLICATION supabase_realtime ADD TABLE public.goal_group_shares;
