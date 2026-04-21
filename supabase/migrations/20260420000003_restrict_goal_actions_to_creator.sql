-- Restrict sub_goals INSERT to only the goal creator
DROP POLICY IF EXISTS "Users can create sub-goals" ON sub_goals;
CREATE POLICY "Only goal creator can create sub-goals"
  ON sub_goals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = sub_goals.goal_id
        AND goals.created_by = auth.uid()
    )
  );

-- Restrict sub_goals UPDATE to only the goal creator
DROP POLICY IF EXISTS "Assigned user or admin can update sub-goals" ON sub_goals;
CREATE POLICY "Only goal creator can update sub-goals"
  ON sub_goals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = sub_goals.goal_id
        AND goals.created_by = auth.uid()
    )
  );

-- Restrict goals DELETE to only the goal creator
DROP POLICY IF EXISTS "Goal creator or owner can delete goals" ON goals;
CREATE POLICY "Only goal creator can delete goals"
  ON goals FOR DELETE
  USING (created_by = auth.uid());
