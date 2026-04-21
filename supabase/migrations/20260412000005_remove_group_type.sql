-- Remove group type column and enum (groups no longer have types)
ALTER TABLE public.groups DROP COLUMN IF EXISTS type;
DROP TYPE IF EXISTS public.group_type;
