-- Fix: group_invites is missing the "name" column that send_group_invites tries to insert.
-- This stores the display name of the invitee (from the invite form) for un-registered users.

ALTER TABLE public.group_invites
  ADD COLUMN IF NOT EXISTS name TEXT;
