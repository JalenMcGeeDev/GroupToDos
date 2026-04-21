-- ============================================================
-- Schedule the due-date-reminders edge function to run daily
-- Requires pg_cron and pg_net extensions (enabled via Dashboard)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Run every day at 9:00 AM UTC
SELECT cron.schedule(
  'due-date-reminders-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://scjtdbmxyadxsvdtnflq.supabase.co/functions/v1/due-date-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
