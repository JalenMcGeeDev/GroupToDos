-- Stores local notification IDs for user-scheduled reminders so they can be:
-- 1. Cancelled if a goal/action is deleted or edited
-- 2. Checked by server-side crons to avoid double-notifying

create table if not exists scheduled_reminders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  goal_id         uuid not null references goals(id) on delete cascade,
  sub_goal_id     uuid references sub_goals(id) on delete cascade,
  notification_id text not null,
  remind_at       timestamptz not null,
  created_at      timestamptz not null default now()
);

create index scheduled_reminders_user_goal_idx    on scheduled_reminders(user_id, goal_id);
create index scheduled_reminders_sub_goal_idx     on scheduled_reminders(sub_goal_id);
create index scheduled_reminders_remind_at_idx    on scheduled_reminders(remind_at);

alter table scheduled_reminders enable row level security;

create policy "Users manage their own scheduled reminders"
  on scheduled_reminders
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
