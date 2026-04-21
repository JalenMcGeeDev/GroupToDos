-- Move help requests & offers from action-level (sub_goal_id) to goal-level (goal_id).
-- Keep sub_goal_id as nullable for backward compatibility with any existing rows.

-- 1. Add goal_id column to help_requests
ALTER TABLE help_requests
  ADD COLUMN goal_id uuid REFERENCES goals(id) ON DELETE CASCADE;

-- 2. Make sub_goal_id nullable on help_requests
ALTER TABLE help_requests
  ALTER COLUMN sub_goal_id DROP NOT NULL;

-- 3. Add goal_id column to help_offers
ALTER TABLE help_offers
  ADD COLUMN goal_id uuid REFERENCES goals(id) ON DELETE CASCADE;

-- 4. Make sub_goal_id nullable on help_offers
ALTER TABLE help_offers
  ALTER COLUMN sub_goal_id DROP NOT NULL;

-- 5. Backfill goal_id from existing sub_goal rows
UPDATE help_requests hr
  SET goal_id = sg.goal_id
  FROM sub_goals sg
  WHERE hr.sub_goal_id = sg.id AND hr.goal_id IS NULL;

UPDATE help_offers ho
  SET goal_id = sg.goal_id
  FROM sub_goals sg
  WHERE ho.sub_goal_id = sg.id AND ho.goal_id IS NULL;
