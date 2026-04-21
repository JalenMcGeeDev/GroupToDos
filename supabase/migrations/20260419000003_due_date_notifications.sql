-- ============================================================
-- Add due-date notification types
-- ============================================================

-- 'due_date_reminder' – sent 1 day before a sub-goal is due
-- 'due_date_missed'   – sent when a sub-goal's due date has passed
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'due_date_reminder';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'due_date_missed';
