-- ============================================================
-- Remove the unused encouragements system
-- ============================================================

-- Drop trigger first
DROP TRIGGER IF EXISTS on_encouragement_sent ON public.encouragements;

-- Drop the trigger function
DROP FUNCTION IF EXISTS public.handle_encouragement();

-- Drop the table (cascades indexes, RLS policies, etc.)
DROP TABLE IF EXISTS public.encouragements CASCADE;
