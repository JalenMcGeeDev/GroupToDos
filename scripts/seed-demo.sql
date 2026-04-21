-- ============================================================
-- DEMO SEED: Populate jalenmcgee's account with realistic data
-- Run via: npx supabase db query --linked -f scripts/seed-demo.sql
-- ============================================================

DO $$
DECLARE
  v_jalen_id UUID;

  -- Fake teammate user IDs
  v_marcus_id UUID := gen_random_uuid();
  v_sarah_id  UUID := gen_random_uuid();
  v_taylor_id UUID := gen_random_uuid();
  v_alex_id   UUID := gen_random_uuid();
  v_maya_id   UUID := gen_random_uuid();

  -- Group IDs
  v_fitness_group_id  UUID := gen_random_uuid();
  v_hustle_group_id   UUID := gen_random_uuid();
  v_wellness_group_id UUID := gen_random_uuid();

  -- Goal IDs
  v_run_goal_id      UUID := gen_random_uuid();
  v_gym_goal_id      UUID := gen_random_uuid();
  v_app_goal_id      UUID := gen_random_uuid();
  v_read_goal_id     UUID := gen_random_uuid();
  v_meditate_goal_id UUID := gen_random_uuid();
  v_cook_goal_id     UUID := gen_random_uuid();
  v_marcus_goal_id   UUID := gen_random_uuid();
  v_sarah_goal_id    UUID := gen_random_uuid();
  v_taylor_goal_id   UUID := gen_random_uuid();

  -- Sub-goal IDs
  v_run_sub1 UUID := gen_random_uuid();
  v_run_sub2 UUID := gen_random_uuid();
  v_run_sub3 UUID := gen_random_uuid();
  v_gym_sub1 UUID := gen_random_uuid();
  v_gym_sub2 UUID := gen_random_uuid();
  v_gym_sub3 UUID := gen_random_uuid();
  v_app_sub1 UUID := gen_random_uuid();
  v_app_sub2 UUID := gen_random_uuid();
  v_app_sub3 UUID := gen_random_uuid();
  v_app_sub4 UUID := gen_random_uuid();
  v_read_sub1 UUID := gen_random_uuid();
  v_read_sub2 UUID := gen_random_uuid();
  v_read_sub3 UUID := gen_random_uuid();
  v_med_sub1  UUID := gen_random_uuid();
  v_med_sub2  UUID := gen_random_uuid();
  v_cook_sub1 UUID := gen_random_uuid();
  v_cook_sub2 UUID := gen_random_uuid();
  v_marcus_sub1 UUID := gen_random_uuid();
  v_marcus_sub2 UUID := gen_random_uuid();
  v_sarah_sub1  UUID := gen_random_uuid();
  v_sarah_sub2  UUID := gen_random_uuid();
  v_taylor_sub1 UUID := gen_random_uuid();

  -- Action log IDs (for comments)
  v_action1 UUID := gen_random_uuid();
  v_action2 UUID := gen_random_uuid();
  v_action3 UUID := gen_random_uuid();

BEGIN
  -- ==========================================
  -- Find jalenmcgee
  -- ==========================================
  SELECT id INTO v_jalen_id FROM public.profiles WHERE display_name = 'jalenmcgee';
  IF v_jalen_id IS NULL THEN
    RAISE EXCEPTION 'No user with display_name "jalenmcgee" found. Sign up first.';
  END IF;
  RAISE NOTICE 'Found user: %', v_jalen_id;

  -- ==========================================
  -- Disable triggers to avoid side effects
  -- ==========================================
  ALTER TABLE public.profiles       DISABLE TRIGGER USER;
  ALTER TABLE public.groups         DISABLE TRIGGER USER;
  ALTER TABLE public.group_members  DISABLE TRIGGER USER;
  ALTER TABLE public.goals          DISABLE TRIGGER USER;
  ALTER TABLE public.sub_goals      DISABLE TRIGGER USER;
  ALTER TABLE public.action_logs    DISABLE TRIGGER USER;
  ALTER TABLE public.goal_reactions DISABLE TRIGGER USER;
  ALTER TABLE public.goal_group_shares DISABLE TRIGGER USER;
  ALTER TABLE public.help_requests  DISABLE TRIGGER USER;
  ALTER TABLE public.help_offers    DISABLE TRIGGER USER;

  -- ==========================================
  -- Update jalenmcgee's profile
  -- ==========================================
  UPDATE public.profiles
  SET display_name = 'Jalen',
      checkin_cadence = 'daily',
      streak_current = 12,
      streak_longest = 28,
      last_action_date = CURRENT_DATE,
      updated_at = now()
  WHERE id = v_jalen_id;

  -- ==========================================
  -- Create fake teammate auth users + profiles
  -- ==========================================
  INSERT INTO auth.users (id, instance_id, aud, role, email, phone, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_marcus_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', NULL, '+15551000001', '', now() - INTERVAL '30 days', now(), '{"provider":"phone","providers":["phone"]}', '{}'),
    (v_sarah_id,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', NULL, '+15551000002', '', now() - INTERVAL '25 days', now(), '{"provider":"phone","providers":["phone"]}', '{}'),
    (v_taylor_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', NULL, '+15551000003', '', now() - INTERVAL '20 days', now(), '{"provider":"phone","providers":["phone"]}', '{}'),
    (v_alex_id,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', NULL, '+15551000004', '', now() - INTERVAL '15 days', now(), '{"provider":"phone","providers":["phone"]}', '{}'),
    (v_maya_id,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', NULL, '+15551000005', '', now() - INTERVAL '18 days', now(), '{"provider":"phone","providers":["phone"]}', '{}');

  -- Update profiles (auto-created by auth.users trigger)
  UPDATE public.profiles SET display_name = 'Marcus',  checkin_cadence = 'daily',        streak_current = 8,  streak_longest = 15, last_action_date = CURRENT_DATE,                     created_at = now() - INTERVAL '30 days' WHERE id = v_marcus_id;
  UPDATE public.profiles SET display_name = 'Sarah',   checkin_cadence = 'daily',        streak_current = 5,  streak_longest = 22, last_action_date = CURRENT_DATE - INTERVAL '1 day',  created_at = now() - INTERVAL '25 days' WHERE id = v_sarah_id;
  UPDATE public.profiles SET display_name = 'Taylor',  checkin_cadence = 'every_2_days', streak_current = 3,  streak_longest = 10, last_action_date = CURRENT_DATE - INTERVAL '1 day',  created_at = now() - INTERVAL '20 days' WHERE id = v_taylor_id;
  UPDATE public.profiles SET display_name = 'Alex',    checkin_cadence = 'daily',        streak_current = 14, streak_longest = 30, last_action_date = CURRENT_DATE,                     created_at = now() - INTERVAL '15 days' WHERE id = v_alex_id;
  UPDATE public.profiles SET display_name = 'Maya',    checkin_cadence = 'every_3_days', streak_current = 6,  streak_longest = 18, last_action_date = CURRENT_DATE - INTERVAL '2 days', created_at = now() - INTERVAL '18 days' WHERE id = v_maya_id;

  -- ==========================================
  -- Groups (no auto-member trigger)
  -- ==========================================
  INSERT INTO public.groups (id, name, description, created_by, created_at)
  VALUES
    (v_fitness_group_id,  'Fitness Squad 💪',      'Getting stronger together. No excuses.',                       v_jalen_id,  now() - INTERVAL '28 days'),
    (v_hustle_group_id,   'Side Hustle Crew 🚀',   'Building our projects and holding each other accountable.',    v_jalen_id,  now() - INTERVAL '21 days'),
    (v_wellness_group_id, 'Wellness Warriors 🧘',  'Mind, body, and soul improvement.',                           v_sarah_id,  now() - INTERVAL '14 days');

  -- ==========================================
  -- Group Members (including owners)
  -- ==========================================
  INSERT INTO public.group_members (group_id, user_id, role, joined_at)
  VALUES
    (v_fitness_group_id, v_jalen_id,  'owner',  now() - INTERVAL '28 days'),
    (v_fitness_group_id, v_marcus_id, 'member', now() - INTERVAL '27 days'),
    (v_fitness_group_id, v_sarah_id,  'member', now() - INTERVAL '26 days'),
    (v_fitness_group_id, v_alex_id,   'member', now() - INTERVAL '14 days'),
    (v_hustle_group_id,  v_jalen_id,  'owner',  now() - INTERVAL '21 days'),
    (v_hustle_group_id,  v_taylor_id, 'member', now() - INTERVAL '20 days'),
    (v_hustle_group_id,  v_maya_id,   'member', now() - INTERVAL '19 days'),
    (v_wellness_group_id, v_sarah_id, 'owner',  now() - INTERVAL '14 days'),
    (v_wellness_group_id, v_jalen_id, 'member', now() - INTERVAL '13 days'),
    (v_wellness_group_id, v_maya_id,  'member', now() - INTERVAL '12 days'),
    (v_wellness_group_id, v_alex_id,  'member', now() - INTERVAL '11 days');

  -- ==========================================
  -- Goals
  -- ==========================================
  INSERT INTO public.goals (id, group_id, title, description, status, start_date, end_date, tangible_reward, progress, created_by, last_action_at, created_at)
  VALUES
    (v_run_goal_id,      v_fitness_group_id,  'Run a 5K in under 25 minutes',    'Training to hit sub-25 min 5K by summer',     'active', CURRENT_DATE - 28, CURRENT_DATE + 60, 'New running shoes',    45.00, v_jalen_id,  now() - INTERVAL '2 hours',  now() - INTERVAL '28 days'),
    (v_gym_goal_id,      v_fitness_group_id,  'Hit my strength PRs',             'Bench 185, Squat 225 by end of quarter',      'active', CURRENT_DATE - 28, CURRENT_DATE + 45, 'New gym bag',          33.33, v_jalen_id,  now() - INTERVAL '1 day',    now() - INTERVAL '28 days'),
    (v_app_goal_id,      v_hustle_group_id,   'Launch CoGoals on the App Store', 'Ship the MVP and get real users',             'active', CURRENT_DATE - 21, CURRENT_DATE + 30, 'Weekend trip 🏖️',     50.00, v_jalen_id,  now() - INTERVAL '3 hours',  now() - INTERVAL '21 days'),
    (v_read_goal_id,     NULL,                'Read 12 books this year',          'One book per month - no excuses',             'active', CURRENT_DATE - 90, CURRENT_DATE + 270, NULL,                  25.00, v_jalen_id,  now() - INTERVAL '2 days',   now() - INTERVAL '90 days'),
    (v_meditate_goal_id, v_wellness_group_id, 'Build a daily meditation habit',  '10 minutes every morning',                    'active', CURRENT_DATE - 13, CURRENT_DATE + 90, 'Meditation retreat',   30.00, v_jalen_id,  now() - INTERVAL '6 hours',  now() - INTERVAL '13 days'),
    (v_cook_goal_id,     v_wellness_group_id, 'Learn to meal prep like a pro',   'Cook healthy meals instead of ordering',      'active', CURRENT_DATE - 13, CURRENT_DATE + 75, NULL,                   20.00, v_jalen_id,  now() - INTERVAL '3 days',   now() - INTERVAL '13 days'),
    (v_marcus_goal_id,   v_fitness_group_id,  'Run a half marathon',             'Training for the fall half marathon',         'active', CURRENT_DATE - 20, CURRENT_DATE + 120, 'Race medal 🏅',       25.00, v_marcus_id, now() - INTERVAL '1 day',    now() - INTERVAL '20 days'),
    (v_sarah_goal_id,    v_wellness_group_id, 'Complete 30 days of yoga',        'Daily yoga practice for flexibility',         'active', CURRENT_DATE - 14, CURRENT_DATE + 16, NULL,                   46.67, v_sarah_id,  now() - INTERVAL '5 hours',  now() - INTERVAL '14 days'),
    (v_taylor_goal_id,   v_hustle_group_id,   'Launch my Etsy shop',             'Get 20 products listed and make first sale',  'active', CURRENT_DATE - 15, CURRENT_DATE + 45, 'Fancy dinner 🍽️',    35.00, v_taylor_id, now() - INTERVAL '2 days',   now() - INTERVAL '15 days');

  -- Share reading goal to Wellness group
  INSERT INTO public.goal_group_shares (goal_id, group_id, shared_by, shared_at)
  VALUES (v_read_goal_id, v_wellness_group_id, v_jalen_id, now() - INTERVAL '10 days');

  -- ==========================================
  -- Sub-Goals
  -- ==========================================
  INSERT INTO public.sub_goals (id, goal_id, parent_id, assigned_to, title, description, level, status, target_value, current_value, due_date, sort_order, created_at)
  VALUES
    (v_run_sub1,    v_run_goal_id,      NULL, v_jalen_id,  'Run 3 times per week',           'Consistency is key',              'milestone', 'in_progress', 12,  7,   CURRENT_DATE + 28, 1, now() - INTERVAL '28 days'),
    (v_run_sub2,    v_run_goal_id,      NULL, v_jalen_id,  'Complete a 5K race',              'Sign up and finish one',          'milestone', 'not_started', 1,   0,   CURRENT_DATE + 45, 2, now() - INTERVAL '28 days'),
    (v_run_sub3,    v_run_goal_id,      NULL, v_jalen_id,  'Run 50 miles total',              'Track total mileage',             'milestone', 'in_progress', 50,  27,  CURRENT_DATE + 60, 3, now() - INTERVAL '28 days'),
    (v_gym_sub1,    v_gym_goal_id,      NULL, v_jalen_id,  'Bench press 185 lbs',             'Current PR: 155 lbs',             'milestone', 'in_progress', 185, 165, CURRENT_DATE + 45, 1, now() - INTERVAL '28 days'),
    (v_gym_sub2,    v_gym_goal_id,      NULL, v_jalen_id,  'Work out 4 times per week',       'Chest/Back/Legs/Shoulders',       'milestone', 'in_progress', 16,  9,   CURRENT_DATE + 28, 2, now() - INTERVAL '28 days'),
    (v_gym_sub3,    v_gym_goal_id,      NULL, v_jalen_id,  'Squat 225 lbs',                   'Current: 185 lbs',                'milestone', 'not_started', 225, 195, CURRENT_DATE + 45, 3, now() - INTERVAL '28 days'),
    (v_app_sub1,    v_app_goal_id,      NULL, v_jalen_id,  'Ship the MVP',                    'Core features working',           'milestone', 'completed',   1,   1,   CURRENT_DATE - 5,  1, now() - INTERVAL '21 days'),
    (v_app_sub2,    v_app_goal_id,      NULL, v_jalen_id,  'Get 100 beta users',              'Friends, family, and beyond',     'milestone', 'in_progress', 100, 23,  CURRENT_DATE + 14, 2, now() - INTERVAL '21 days'),
    (v_app_sub3,    v_app_goal_id,      NULL, v_taylor_id, 'Set up CI/CD pipeline',           'Automated builds and deploys',    'milestone', 'completed',   1,   1,   CURRENT_DATE - 3,  3, now() - INTERVAL '15 days'),
    (v_app_sub4,    v_app_goal_id,      NULL, v_jalen_id,  'Submit to App Store',             'Pass review and go live',         'milestone', 'in_progress', 1,   0,   CURRENT_DATE + 7,  4, now() - INTERVAL '21 days'),
    (v_read_sub1,   v_read_goal_id,     NULL, v_jalen_id,  'Finish Atomic Habits',            'By James Clear',                  'milestone', 'completed',   1,   1,   CURRENT_DATE - 30, 1, now() - INTERVAL '90 days'),
    (v_read_sub2,   v_read_goal_id,     NULL, v_jalen_id,  'Read 30 min every day',           'Before bed, no phone',            'milestone', 'in_progress', 30,  18,  CURRENT_DATE + 30, 2, now() - INTERVAL '60 days'),
    (v_read_sub3,   v_read_goal_id,     NULL, v_jalen_id,  'Finish 3 books by June',          'Currently on book 2',             'milestone', 'in_progress', 3,   1,   CURRENT_DATE + 60, 3, now() - INTERVAL '90 days'),
    (v_med_sub1,    v_meditate_goal_id, NULL, v_jalen_id,  'Meditate 10 min daily',           'Use Headspace or timer',          'milestone', 'in_progress', 30,  12,  CURRENT_DATE + 17, 1, now() - INTERVAL '13 days'),
    (v_med_sub2,    v_meditate_goal_id, NULL, v_jalen_id,  'Hit a 30-day streak',             'No skipping days',                'milestone', 'not_started', 30,  12,  CURRENT_DATE + 17, 2, now() - INTERVAL '13 days'),
    (v_cook_sub1,   v_cook_goal_id,     NULL, v_jalen_id,  'Cook 5 new recipes',              'Try something new each week',     'milestone', 'in_progress', 5,   2,   CURRENT_DATE + 30, 1, now() - INTERVAL '13 days'),
    (v_cook_sub2,   v_cook_goal_id,     NULL, v_jalen_id,  'Meal prep every Sunday',          'Prep lunches for the week',       'milestone', 'in_progress', 8,   3,   CURRENT_DATE + 45, 2, now() - INTERVAL '13 days'),
    (v_marcus_sub1, v_marcus_goal_id,   NULL, v_marcus_id, 'Run 5 miles without stopping',    'Build endurance base',            'milestone', 'completed',   1,   1,   CURRENT_DATE - 5,  1, now() - INTERVAL '20 days'),
    (v_marcus_sub2, v_marcus_goal_id,   NULL, v_marcus_id, 'Complete a 10-mile run',          'Long run training',               'milestone', 'in_progress', 1,   0,   CURRENT_DATE + 60, 2, now() - INTERVAL '20 days'),
    (v_sarah_sub1,  v_sarah_goal_id,    NULL, v_sarah_id,  'Do yoga every morning',           '20 min sessions',                 'milestone', 'in_progress', 30,  14,  CURRENT_DATE + 16, 1, now() - INTERVAL '14 days'),
    (v_sarah_sub2,  v_sarah_goal_id,    NULL, v_sarah_id,  'Master crow pose',                'Balance and core strength',       'milestone', 'not_started', 1,   0,   CURRENT_DATE + 16, 2, now() - INTERVAL '14 days'),
    (v_taylor_sub1, v_taylor_goal_id,   NULL, v_taylor_id, 'List 20 products',                'Photos, descriptions, pricing',   'milestone', 'in_progress', 20,  7,   CURRENT_DATE + 14, 1, now() - INTERVAL '15 days');

  -- ==========================================
  -- Action Logs
  -- ==========================================
  INSERT INTO public.action_logs (id, user_id, sub_goal_id, note, value, created_at)
  VALUES
    (v_action1,          v_jalen_id, v_run_sub1, 'Morning run - 3.2 miles in 28 min 🏃',               1,   now() - INTERVAL '2 hours'),
    (gen_random_uuid(),  v_jalen_id, v_run_sub3, 'Added 3.2 miles to total',                           3.2, now() - INTERVAL '2 hours'),
    (gen_random_uuid(),  v_jalen_id, v_run_sub1, 'Tempo run - pushed the pace today',                  1,   now() - INTERVAL '2 days'),
    (gen_random_uuid(),  v_jalen_id, v_run_sub3, 'Tempo run mileage',                                  2.8, now() - INTERVAL '2 days'),
    (gen_random_uuid(),  v_jalen_id, v_run_sub1, 'Easy recovery run',                                  1,   now() - INTERVAL '4 days'),
    (gen_random_uuid(),  v_jalen_id, v_run_sub3, 'Recovery mileage',                                   2.0, now() - INTERVAL '4 days'),
    (gen_random_uuid(),  v_jalen_id, v_run_sub1, 'Long run Saturday - feeling strong',                 1,   now() - INTERVAL '6 days'),
    (gen_random_uuid(),  v_jalen_id, v_run_sub3, 'Long run distance',                                  5.1, now() - INTERVAL '6 days'),
    (v_action2,          v_jalen_id, v_gym_sub1, 'Bench: 165 x 5 - new working weight!',               1,   now() - INTERVAL '1 day'),
    (gen_random_uuid(),  v_jalen_id, v_gym_sub2, 'Chest & triceps day',                                1,   now() - INTERVAL '1 day'),
    (gen_random_uuid(),  v_jalen_id, v_gym_sub2, 'Back & biceps day',                                  1,   now() - INTERVAL '3 days'),
    (gen_random_uuid(),  v_jalen_id, v_gym_sub2, 'Leg day - squats felt heavy',                        1,   now() - INTERVAL '5 days'),
    (gen_random_uuid(),  v_jalen_id, v_gym_sub3, 'Squat: 195 x 3',                                    1,   now() - INTERVAL '5 days'),
    (v_action3,          v_jalen_id, v_app_sub2, 'Got 5 more friends to sign up!',                     5,   now() - INTERVAL '3 hours'),
    (gen_random_uuid(),  v_jalen_id, v_app_sub4, 'Privacy policy done, prepping store listing',        1,   now() - INTERVAL '3 hours'),
    (gen_random_uuid(),  v_jalen_id, v_app_sub1, 'MVP shipped! All core features working 🎉',          1,   now() - INTERVAL '5 days'),
    (gen_random_uuid(),  v_jalen_id, v_med_sub1, 'Morning meditation - 10 min guided',                 1,   now() - INTERVAL '6 hours'),
    (gen_random_uuid(),  v_jalen_id, v_med_sub1, 'Meditation before bed - tried body scan',            1,   now() - INTERVAL '1 day'),
    (gen_random_uuid(),  v_jalen_id, v_med_sub1, 'Quick 10 min session',                               1,   now() - INTERVAL '2 days'),
    (gen_random_uuid(),  v_jalen_id, v_med_sub1, 'Guided meditation - focus theme',                    1,   now() - INTERVAL '3 days'),
    (gen_random_uuid(),  v_jalen_id, v_read_sub2, 'Read 35 min of Psychology of Money',                1,   now() - INTERVAL '2 days'),
    (gen_random_uuid(),  v_jalen_id, v_read_sub1, 'Finished Atomic Habits! Great read.',               1,   now() - INTERVAL '30 days'),
    (gen_random_uuid(),  v_jalen_id, v_cook_sub1, 'Made Thai basil chicken - turned out amazing',      1,   now() - INTERVAL '3 days'),
    (gen_random_uuid(),  v_jalen_id, v_cook_sub2, 'Prepped chicken, rice, and veggies for the week',   1,   now() - INTERVAL '4 days'),
    (gen_random_uuid(),  v_jalen_id, v_cook_sub1, 'Tried a new pasta recipe - decent first attempt',   1,   now() - INTERVAL '10 days'),
    (gen_random_uuid(),  v_jalen_id, v_cook_sub2, 'Sunday meal prep: salmon bowls 🍣',                  1,   now() - INTERVAL '11 days'),
    (gen_random_uuid(),  v_marcus_id, v_marcus_sub1, 'Did it! 5 miles non-stop 💪',                    1,   now() - INTERVAL '5 days'),
    (gen_random_uuid(),  v_marcus_id, v_marcus_sub2, 'Long run: 7 miles - legs were dead after',       1,   now() - INTERVAL '1 day'),
    (gen_random_uuid(),  v_marcus_id, v_marcus_sub2, '6 mile run - finding my pace',                   1,   now() - INTERVAL '4 days'),
    (gen_random_uuid(),  v_sarah_id, v_sarah_sub1, 'Morning flow - 25 minutes today',                  1,   now() - INTERVAL '5 hours'),
    (gen_random_uuid(),  v_sarah_id, v_sarah_sub1, 'Vinyasa flow - getting more flexible!',            1,   now() - INTERVAL '1 day'),
    (gen_random_uuid(),  v_sarah_id, v_sarah_sub1, 'Quick morning stretch and yoga',                   1,   now() - INTERVAL '2 days'),
    (gen_random_uuid(),  v_sarah_id, v_sarah_sub1, 'Power yoga session 🔥',                            1,   now() - INTERVAL '3 days'),
    (gen_random_uuid(),  v_taylor_id, v_taylor_sub1, 'Listed 2 more earring designs',                  2,   now() - INTERVAL '2 days'),
    (gen_random_uuid(),  v_taylor_id, v_taylor_sub1, 'Product photography done for 3 items',           3,   now() - INTERVAL '5 days'),
    (gen_random_uuid(),  v_taylor_id, v_app_sub3,    'CI/CD is live! Deploys on merge to main',        1,   now() - INTERVAL '3 days');

  -- ==========================================
  -- Goal Reactions
  -- ==========================================
  INSERT INTO public.goal_reactions (goal_id, user_id, reaction_type, created_at)
  VALUES
    (v_run_goal_id,      v_marcus_id, '🔥', now() - INTERVAL '1 day'),
    (v_run_goal_id,      v_sarah_id,  '💪', now() - INTERVAL '2 days'),
    (v_run_goal_id,      v_alex_id,   '🎯', now() - INTERVAL '3 days'),
    (v_app_goal_id,      v_taylor_id, '🚀', now() - INTERVAL '4 hours'),
    (v_app_goal_id,      v_maya_id,   '💯', now() - INTERVAL '1 day'),
    (v_gym_goal_id,      v_marcus_id, '💪', now() - INTERVAL '2 days'),
    (v_gym_goal_id,      v_alex_id,   '🔥', now() - INTERVAL '3 days'),
    (v_meditate_goal_id, v_sarah_id,  '⭐', now() - INTERVAL '1 day'),
    (v_meditate_goal_id, v_maya_id,   '🙌', now() - INTERVAL '2 days'),
    (v_marcus_goal_id,   v_jalen_id,  '🔥', now() - INTERVAL '1 day'),
    (v_marcus_goal_id,   v_sarah_id,  '👏', now() - INTERVAL '3 days'),
    (v_sarah_goal_id,    v_jalen_id,  '💪', now() - INTERVAL '5 hours'),
    (v_sarah_goal_id,    v_alex_id,   '⭐', now() - INTERVAL '1 day'),
    (v_taylor_goal_id,   v_jalen_id,  '🎯', now() - INTERVAL '2 days'),
    (v_cook_goal_id,     v_maya_id,   '❤️', now() - INTERVAL '3 days');

  -- ==========================================
  -- Comments
  -- ==========================================
  INSERT INTO public.comments (user_id, target_type, target_id, body, created_at)
  VALUES
    (v_marcus_id, 'action_log', v_action1, 'Beast mode! 🔥 Keep it up bro',                                now() - INTERVAL '1 hour'),
    (v_sarah_id,  'action_log', v_action1, 'Youre getting so fast!',                                       now() - INTERVAL '45 minutes'),
    (v_alex_id,   'action_log', v_action2, 'Nice PR! 185 is coming soon',                                  now() - INTERVAL '12 hours'),
    (v_taylor_id, 'action_log', v_action3, 'The app is looking great! Shared it with my friends',           now() - INTERVAL '2 hours'),
    (v_maya_id,   'goal',       v_app_goal_id,   'Can''t wait to see this on the App Store!',               now() - INTERVAL '6 hours'),
    (v_jalen_id,  'goal',       v_marcus_goal_id, 'Letss gooo! Half marathon here you come 🏃',             now() - INTERVAL '4 hours'),
    (v_jalen_id,  'goal',       v_sarah_goal_id,  'You make yoga look easy 😂',                             now() - INTERVAL '3 hours'),
    (v_marcus_id, 'goal',       v_gym_goal_id,    'We hitting the gym together this week?',                  now() - INTERVAL '8 hours'),
    (v_sarah_id,  'goal',       v_meditate_goal_id, 'Meditation buddies! 🧘 How do you like Headspace?',    now() - INTERVAL '10 hours');

  -- ==========================================
  -- Notifications
  -- ==========================================
  INSERT INTO public.notifications (user_id, type, title, body, data, read, created_at)
  VALUES
    (v_jalen_id, 'teammate_action',       'Marcus logged an action',     'Long run: 7 miles - legs were dead after',  ('{"user_id":"' || v_marcus_id || '"}')::jsonb,  false, now() - INTERVAL '1 hour'),
    (v_jalen_id, 'teammate_action',       'Sarah logged an action',      'Morning flow - 25 minutes today',           ('{"user_id":"' || v_sarah_id  || '"}')::jsonb,  false, now() - INTERVAL '3 hours'),
    (v_jalen_id, 'comment',               'Marcus commented',            'Beast mode! 🔥 Keep it up bro',             ('{"target_type":"action_log","target_id":"' || v_action1 || '"}')::jsonb, false, now() - INTERVAL '1 hour'),
    (v_jalen_id, 'goal_reaction',         'Taylor reacted to your goal', '🚀 on Launch CoGoals on the App Store',     ('{"goal_id":"' || v_app_goal_id || '"}')::jsonb, false, now() - INTERVAL '4 hours'),
    (v_jalen_id, 'milestone_celebration', 'Milestone complete! 🎉',      'You completed: Ship the MVP',               ('{"goal_id":"' || v_app_goal_id || '","sub_goal_id":"' || v_app_sub1 || '"}')::jsonb, false, now() - INTERVAL '5 days'),
    (v_jalen_id, 'member_joined',         'New member joined',           'Alex joined Fitness Squad 💪',               ('{"group_id":"' || v_fitness_group_id || '"}')::jsonb, true, now() - INTERVAL '14 days'),
    (v_jalen_id, 'checkin_reminder',      'Time to check in!',           'Don''t break your 12-day streak!',          '{}'::jsonb, true, now() - INTERVAL '1 day'),
    (v_jalen_id, 'streak_alert',          'Streak milestone! 🔥',        'You hit a 7-day streak! Keep going!',       '{}'::jsonb, true, now() - INTERVAL '5 days'),
    (v_jalen_id, 'goal_completed',        'Goal completed! 🎯',          'Finished: Read Atomic Habits',              ('{"goal_id":"' || v_read_goal_id || '"}')::jsonb, true, now() - INTERVAL '30 days');

  -- ==========================================
  -- Group Activities
  -- ==========================================
  INSERT INTO public.group_activities (group_id, user_id, type, goal_id, sub_goal_id, metadata, created_at)
  VALUES
    (v_fitness_group_id, v_jalen_id,  'action_completed', v_run_goal_id,    v_run_sub1,    '{"action_title":"Run 3 times per week"}',         now() - INTERVAL '2 hours'),
    (v_fitness_group_id, v_jalen_id,  'action_completed', v_gym_goal_id,    v_gym_sub1,    '{"action_title":"Bench press 185 lbs"}',           now() - INTERVAL '1 day'),
    (v_fitness_group_id, v_marcus_id, 'action_completed', v_marcus_goal_id, v_marcus_sub2, '{"action_title":"Complete a 10-mile run"}',        now() - INTERVAL '1 day'),
    (v_fitness_group_id, v_marcus_id, 'action_completed', v_marcus_goal_id, v_marcus_sub1, '{"action_title":"Run 5 miles without stopping"}',  now() - INTERVAL '5 days'),
    (v_fitness_group_id, v_alex_id,   'member_joined',    NULL,             NULL,          '{"display_name":"Alex"}',                          now() - INTERVAL '14 days'),
    (v_fitness_group_id, v_jalen_id,  'goal_created',     v_run_goal_id,    NULL,          '{"goal_title":"Run a 5K in under 25 minutes"}',    now() - INTERVAL '28 days'),
    (v_fitness_group_id, v_jalen_id,  'goal_created',     v_gym_goal_id,    NULL,          '{"goal_title":"Hit my strength PRs"}',              now() - INTERVAL '28 days'),
    (v_fitness_group_id, v_marcus_id, 'goal_created',     v_marcus_goal_id, NULL,          '{"goal_title":"Run a half marathon"}',              now() - INTERVAL '20 days'),
    (v_hustle_group_id, v_jalen_id,  'action_completed', v_app_goal_id,    v_app_sub2,    '{"action_title":"Get 100 beta users"}',             now() - INTERVAL '3 hours'),
    (v_hustle_group_id, v_jalen_id,  'action_completed', v_app_goal_id,    v_app_sub1,    '{"action_title":"Ship the MVP"}',                   now() - INTERVAL '5 days'),
    (v_hustle_group_id, v_taylor_id, 'action_completed', v_app_goal_id,    v_app_sub3,    '{"action_title":"Set up CI/CD pipeline"}',          now() - INTERVAL '3 days'),
    (v_hustle_group_id, v_taylor_id, 'action_completed', v_taylor_goal_id, v_taylor_sub1, '{"action_title":"List 20 products"}',               now() - INTERVAL '2 days'),
    (v_hustle_group_id, v_jalen_id,  'goal_created',     v_app_goal_id,    NULL,          '{"goal_title":"Launch CoGoals on the App Store"}',   now() - INTERVAL '21 days'),
    (v_hustle_group_id, v_taylor_id, 'goal_created',     v_taylor_goal_id, NULL,          '{"goal_title":"Launch my Etsy shop"}',               now() - INTERVAL '15 days'),
    (v_wellness_group_id, v_jalen_id, 'action_completed', v_meditate_goal_id, v_med_sub1,   '{"action_title":"Meditate 10 min daily"}',        now() - INTERVAL '6 hours'),
    (v_wellness_group_id, v_sarah_id, 'action_completed', v_sarah_goal_id,    v_sarah_sub1, '{"action_title":"Do yoga every morning"}',         now() - INTERVAL '5 hours'),
    (v_wellness_group_id, v_jalen_id, 'goal_shared',      v_read_goal_id,     NULL,         '{"goal_title":"Read 12 books this year"}',         now() - INTERVAL '10 days'),
    (v_wellness_group_id, v_sarah_id, 'goal_created',     v_sarah_goal_id,    NULL,         '{"goal_title":"Complete 30 days of yoga"}',        now() - INTERVAL '14 days'),
    (v_wellness_group_id, v_jalen_id, 'goal_created',     v_meditate_goal_id, NULL,         '{"goal_title":"Build a daily meditation habit"}',  now() - INTERVAL '13 days'),
    (v_wellness_group_id, v_jalen_id, 'goal_created',     v_cook_goal_id,     NULL,         '{"goal_title":"Learn to meal prep like a pro"}',   now() - INTERVAL '13 days');

  -- ==========================================
  -- Help Requests & Offers
  -- ==========================================
  INSERT INTO public.help_requests (sub_goal_id, requested_by, group_id, note, resolved, created_at)
  VALUES
    (v_run_sub2,    v_jalen_id,  v_fitness_group_id, 'Anyone know good 5K races coming up in the area? Need to register for one.',                false, now() - INTERVAL '2 days'),
    (v_taylor_sub1, v_taylor_id, v_hustle_group_id,  'Struggling with product photography - any tips for good lighting on a budget?',              false, now() - INTERVAL '3 days');

  INSERT INTO public.help_offers (sub_goal_id, offered_by, group_id, note, created_at)
  VALUES
    (v_run_sub2,    v_marcus_id, v_fitness_group_id, 'There''s a great 5K on June 15th at Piedmont Park! I can send you the link.',                now() - INTERVAL '1 day'),
    (v_taylor_sub1, v_maya_id,   v_hustle_group_id,  'I have a ring light you can borrow! Natural window light also works great for product shots.', now() - INTERVAL '2 days');

  -- ==========================================
  -- Re-enable ALL triggers
  -- ==========================================
  ALTER TABLE public.profiles       ENABLE TRIGGER USER;
  ALTER TABLE public.groups         ENABLE TRIGGER USER;
  ALTER TABLE public.group_members  ENABLE TRIGGER USER;
  ALTER TABLE public.goals          ENABLE TRIGGER USER;
  ALTER TABLE public.sub_goals      ENABLE TRIGGER USER;
  ALTER TABLE public.action_logs    ENABLE TRIGGER USER;
  ALTER TABLE public.goal_reactions ENABLE TRIGGER USER;
  ALTER TABLE public.goal_group_shares ENABLE TRIGGER USER;
  ALTER TABLE public.help_requests  ENABLE TRIGGER USER;
  ALTER TABLE public.help_offers    ENABLE TRIGGER USER;

  RAISE NOTICE '✅ Demo data seeded successfully!';
  RAISE NOTICE 'User: Jalen (%), streak: 12 days', v_jalen_id;
  RAISE NOTICE 'Groups: Fitness Squad, Side Hustle Crew, Wellness Warriors';
  RAISE NOTICE 'Teammates: Marcus, Sarah, Taylor, Alex, Maya';
  RAISE NOTICE 'Goals: 9 total (6 for Jalen, 3 for teammates)';
END $$;
