-- ============================================================
-- FIX: Infinite recursion in group_members RLS policies
-- The SELECT and DELETE policies on group_members were querying
-- group_members itself, causing infinite recursion.
-- Fix: use a SECURITY DEFINER function that bypasses RLS.
-- ============================================================

-- 1. Create a helper function that checks membership without RLS
CREATE OR REPLACE FUNCTION public.is_group_member(
  _group_id UUID,
  _user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id
      AND user_id = _user_id
  );
$$;

-- 2. Create a helper to check if user is group owner
CREATE OR REPLACE FUNCTION public.is_group_owner(
  _group_id UUID,
  _user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id
      AND user_id = _user_id
      AND role = 'owner'
  );
$$;

-- 3. Drop the broken policies
DROP POLICY IF EXISTS "Members can view group members" ON public.group_members;
DROP POLICY IF EXISTS "Users can leave or owners can remove" ON public.group_members;

-- 4. Recreate SELECT policy using the helper function
CREATE POLICY "Members can view group members"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (
    public.is_group_member(group_id, auth.uid())
  );

-- 5. Recreate DELETE policy using the helper function
CREATE POLICY "Users can leave or owners can remove"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_group_owner(group_id, auth.uid())
  );
