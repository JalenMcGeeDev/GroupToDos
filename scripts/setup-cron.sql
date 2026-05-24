-- Schedule the daily-reminders edge function to run every hour via pg_cron + pg_net.
-- Run this in the Supabase SQL editor.
--
-- Prerequisites:
--   1. pg_cron and pg_net extensions must be enabled (Dashboard → Database → Extensions)
--   2. Replace <PROJECT_REF> with your Supabase project ref (e.g. abcdefghijklmnop)
--   3. Replace <SERVICE_ROLE_KEY> with your service_role key (Settings → API)

select cron.schedule(
  'hourly-checkin-reminders',
  '0 * * * *',   -- top of every hour
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  )
  $$
);

-- To verify it was created:
-- select * from cron.job;

-- To remove it:
-- select cron.unschedule('hourly-checkin-reminders');
