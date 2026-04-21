-- Seed a single user with phone +19196140457
-- Creates: 1 auth user, 1 group, 3 goals (2 group + 1 personal), sub-goals, action logs
DO $$
DECLARE
  v_user_id     UUID := gen_random_uuid();
  v_group_id    UUID := gen_random_uuid();
  v_goal1_id    UUID := gen_random_uuid();
  v_goal2_id    UUID := gen_random_uuid();
  v_goal3_id    UUID := gen_random_uuid();
  v_sub1a       UUID := gen_random_uuid();
  v_sub1b       UUID := gen_random_uuid();
  v_sub1c       UUID := gen_random_uuid();
  v_sub2a       UUID := gen_random_uuid();
  v_sub2b       UUID := gen_random_uuid();
  v_sub2c       UUID := gen_random_uuid();
  v_sub3a       UUID := gen_random_uuid();
  v_sub3b       UUID := gen_random_uuid();
BEGIN
  -- ==========================================
  -- Create auth user
  -- ==========================================
  INSERT INTO auth.users (id, instance_id, aud, role, email, phone, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    NULL,
    '+19196140457',
    '',
    now() - INTERVAL '14 days',
    now(),
    '{"provider":"phone","providers":["phone"]}',
    '{}'
  );

  -- Update profile (auto-created by trigger)
  UPDATE public.profiles SET
    display_name    = 'Jalen',
    checkin_cadence  = 'daily',
    streak_current   = 5,
    streak_longest   = 5,
    last_action_date = CURRENT_DATE,
    updated_at       = now()
  WHERE id = v_user_id;

  -- ==========================================
  -- Group
  -- ==========================================
  INSERT INTO public.groups (id, name, description, created_by, created_at)
  VALUES (v_group_id, 'Personal Growth 🌱', 'Level up in every area of life.', v_user_id, now() - INTERVAL '14 days');
  -- Trigger auto-adds creator as owner in group_members

  -- ==========================================
  -- Goals
  -- ==========================================
  INSERT INTO public.goals (id, group_id, title, description, status, start_date, end_date, tangible_reward, progress, created_by, last_action_at, created_at)
  VALUES
    (v_goal1_id, v_group_id, 'Get in the best shape of my life', 'Consistent workouts and clean eating through summer', 'active', CURRENT_DATE - 14, CURRENT_DATE + 76, 'New wardrobe 🔥', 30.00, v_user_id, now() - INTERVAL '3 hours', now() - INTERVAL '14 days'),
    (v_goal2_id, v_group_id, 'Ship a side project',             'Build and launch something real',                     'active', CURRENT_DATE - 10, CURRENT_DATE + 50, NULL,               35.00, v_user_id, now() - INTERVAL '1 day',   now() - INTERVAL '10 days'),
    (v_goal3_id, NULL,       'Read 2 books this month',         'No excuses, 30 min a day minimum',                    'active', CURRENT_DATE - 7,  CURRENT_DATE + 23, NULL,               25.00, v_user_id, now() - INTERVAL '2 days',  now() - INTERVAL '7 days');

  -- Share reading goal into group
  INSERT INTO public.goal_group_shares (goal_id, group_id, shared_by, shared_at)
  VALUES (v_goal3_id, v_group_id, v_user_id, now() - INTERVAL '6 days');

  -- ==========================================
  -- Sub-Goals
  -- ==========================================
  INSERT INTO public.sub_goals (id, goal_id, parent_id, assigned_to, title, description, level, status, target_value, current_value, due_date, sort_order, created_at)
  VALUES
    -- Fitness goal sub-goals
    (v_sub1a, v_goal1_id, NULL, v_user_id, 'Work out 5 days per week',    'Mix of lifting and cardio',       'milestone', 'in_progress', 20, 9,  CURRENT_DATE + 28, 1, now() - INTERVAL '14 days'),
    (v_sub1b, v_goal1_id, NULL, v_user_id, 'Run 30 total miles',          'Track mileage each run',          'milestone', 'in_progress', 30, 12, CURRENT_DATE + 45, 2, now() - INTERVAL '14 days'),
    (v_sub1c, v_goal1_id, NULL, v_user_id, 'No fast food for 30 days',    'Cook at home or eat clean',       'milestone', 'in_progress', 30, 14, CURRENT_DATE + 16, 3, now() - INTERVAL '14 days'),
    -- Side project sub-goals
    (v_sub2a, v_goal2_id, NULL, v_user_id, 'Finish core features',        'Auth, main screens, backend',     'milestone', 'completed',   1,  1,  CURRENT_DATE - 2,  1, now() - INTERVAL '10 days'),
    (v_sub2b, v_goal2_id, NULL, v_user_id, 'Deploy to production',        'Get it live and usable',          'milestone', 'in_progress', 1,  0,  CURRENT_DATE + 10, 2, now() - INTERVAL '10 days'),
    (v_sub2c, v_goal2_id, NULL, v_user_id, 'Get 10 real users',           'Friends first, then expand',      'milestone', 'in_progress', 10, 3,  CURRENT_DATE + 30, 3, now() - INTERVAL '10 days'),
    -- Reading sub-goals
    (v_sub3a, v_goal3_id, NULL, v_user_id, 'Finish current book',         'Halfway through already',         'milestone', 'in_progress', 1,  0,  CURRENT_DATE + 10, 1, now() - INTERVAL '7 days'),
    (v_sub3b, v_goal3_id, NULL, v_user_id, 'Read 30 min every day',       'Before bed, phone on charger',    'milestone', 'in_progress', 23, 5,  CURRENT_DATE + 23, 2, now() - INTERVAL '7 days');

  -- ==========================================
  -- Action Logs
  -- ==========================================
  INSERT INTO public.action_logs (id, user_id, sub_goal_id, note, value, created_at)
  VALUES
    -- Fitness logs
    (gen_random_uuid(), v_user_id, v_sub1a, 'Upper body day - bench and rows 💪',          1,   now() - INTERVAL '3 hours'),
    (gen_random_uuid(), v_user_id, v_sub1b, '3.5 mile run this morning',                   3.5, now() - INTERVAL '3 hours'),
    (gen_random_uuid(), v_user_id, v_sub1a, 'Leg day - squats and lunges',                 1,   now() - INTERVAL '1 day'),
    (gen_random_uuid(), v_user_id, v_sub1a, 'Cardio + abs session',                        1,   now() - INTERVAL '2 days'),
    (gen_random_uuid(), v_user_id, v_sub1b, '4 mile run - felt great',                     4.0, now() - INTERVAL '2 days'),
    (gen_random_uuid(), v_user_id, v_sub1a, 'Push day - chest and shoulders',              1,   now() - INTERVAL '3 days'),
    (gen_random_uuid(), v_user_id, v_sub1c, 'Day 14 no fast food - cooked stir fry',       1,   now() - INTERVAL '3 hours'),
    (gen_random_uuid(), v_user_id, v_sub1b, '2.5 mile easy run',                           2.5, now() - INTERVAL '5 days'),
    (gen_random_uuid(), v_user_id, v_sub1a, 'Full body workout at the gym',                1,   now() - INTERVAL '5 days'),
    -- Side project logs
    (gen_random_uuid(), v_user_id, v_sub2a, 'Core features done! Moving to polish 🎉',     1,   now() - INTERVAL '2 days'),
    (gen_random_uuid(), v_user_id, v_sub2b, 'Set up hosting and CI pipeline',               1,   now() - INTERVAL '1 day'),
    (gen_random_uuid(), v_user_id, v_sub2c, 'Got 3 friends to try the app',                 3,   now() - INTERVAL '1 day'),
    -- Reading logs
    (gen_random_uuid(), v_user_id, v_sub3b, 'Read 40 min before bed - good chapter',        1,   now() - INTERVAL '2 days'),
    (gen_random_uuid(), v_user_id, v_sub3b, '30 min reading session',                       1,   now() - INTERVAL '3 days'),
    (gen_random_uuid(), v_user_id, v_sub3b, 'Read on the train - 25 min',                   1,   now() - INTERVAL '5 days');

  -- ==========================================
  -- Group Activities
  -- ==========================================
  INSERT INTO public.group_activities (group_id, user_id, type, goal_id, sub_goal_id, metadata, created_at)
  VALUES
    (v_group_id, v_user_id, 'goal_created',      v_goal1_id, NULL,    '{"title":"Get in the best shape of my life"}',  now() - INTERVAL '14 days'),
    (v_group_id, v_user_id, 'goal_created',      v_goal2_id, NULL,    '{"title":"Ship a side project"}',               now() - INTERVAL '10 days'),
    (v_group_id, v_user_id, 'goal_shared',        v_goal3_id, NULL,    '{"title":"Read 2 books this month"}',           now() - INTERVAL '6 days'),
    (v_group_id, v_user_id, 'action_completed',  v_goal1_id, v_sub1a, '{"note":"Upper body day"}',                     now() - INTERVAL '3 hours'),
    (v_group_id, v_user_id, 'action_completed',  v_goal2_id, v_sub2a, '{"note":"Core features done!"}',                now() - INTERVAL '2 days'),
    (v_group_id, v_user_id, 'action_completed',  v_goal1_id, v_sub1a, '{"note":"Leg day"}',                            now() - INTERVAL '1 day');

  RAISE NOTICE 'Seeded user % with phone +19196140457', v_user_id;
END $$;
