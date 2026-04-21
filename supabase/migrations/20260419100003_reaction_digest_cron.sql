-- ============================================================
-- Schedule the reaction digest push notification CRON
-- Runs every 2 minutes to batch reaction push notifications
-- ============================================================

SELECT cron.schedule(
  'reaction-digest-push',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://scjtdbmxyadxsvdtnflq.supabase.co/functions/v1/send-reaction-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
