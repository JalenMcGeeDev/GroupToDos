-- Add timezone column to profiles so daily-reminders can notify each user at 9am local time
alter table public.profiles
  add column if not exists timezone text not null default 'America/New_York';
