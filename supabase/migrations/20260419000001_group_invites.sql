-- ============================================================
-- Group Invites: phone-based invitation system
-- ============================================================

-- Invite status enum
CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- Group invites table
CREATE TABLE public.group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  status public.invite_status NOT NULL DEFAULT 'pending',
  resolved_user_id UUID REFERENCES public.profiles(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, phone)
);

-- Index for looking up invites by phone (used during signup resolution)
CREATE INDEX idx_group_invites_phone_status ON public.group_invites (phone, status);
-- Index for fetching a user's pending invites
CREATE INDEX idx_group_invites_resolved_user ON public.group_invites (resolved_user_id, status);

-- ----------------------------------------
-- Resolve pending invites for a new user
-- Called after profile creation via trigger
-- Matches the new user's phone to any pending invites
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_pending_invites(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
  v_invite RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Get the user's phone number from auth.users
  SELECT phone INTO v_phone FROM auth.users WHERE id = p_user_id;
  IF v_phone IS NULL OR v_phone = '' THEN
    RETURN 0;
  END IF;

  -- Update all pending, non-expired invites matching this phone
  FOR v_invite IN
    UPDATE public.group_invites
    SET resolved_user_id = p_user_id,
        updated_at = now()
    WHERE phone = v_phone
      AND status = 'pending'
      AND expires_at > now()
      AND resolved_user_id IS NULL
    RETURNING id, group_id, invited_by
  LOOP
    -- Create an in-app notification for each pending invite
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT
      p_user_id,
      'group_invite',
      inviter.display_name || ' invited you to join a group',
      'Tap to view and accept the invite to "' || g.name || '"',
      jsonb_build_object(
        'invite_id', v_invite.id,
        'group_id', v_invite.group_id,
        'inviter_id', v_invite.invited_by
      )
    FROM public.profiles inviter
    JOIN public.groups g ON g.id = v_invite.group_id
    WHERE inviter.id = v_invite.invited_by;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ----------------------------------------
-- Accept a group invite
-- Validates ownership, adds to group, notifies inviter
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invite(p_invite_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_user_name TEXT;
  v_group_name TEXT;
BEGIN
  -- Fetch and validate invite
  SELECT * INTO v_invite
  FROM public.group_invites
  WHERE id = p_invite_id
    AND resolved_user_id = auth.uid()
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already processed';
  END IF;

  -- Add user to group
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_invite.group_id, auth.uid(), 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- Mark invite as accepted
  UPDATE public.group_invites
  SET status = 'accepted', updated_at = now()
  WHERE id = p_invite_id;

  -- Get names for notification
  SELECT display_name INTO v_user_name FROM public.profiles WHERE id = auth.uid();
  SELECT name INTO v_group_name FROM public.groups WHERE id = v_invite.group_id;

  -- Notify inviter
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_invite.invited_by,
    'member_joined',
    COALESCE(v_user_name, 'Someone') || ' accepted your invite',
    'They joined "' || COALESCE(v_group_name, 'your group') || '"',
    jsonb_build_object('group_id', v_invite.group_id, 'user_id', auth.uid())
  );

  RETURN v_invite.group_id;
END;
$$;

-- ----------------------------------------
-- Decline a group invite
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.decline_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.group_invites
  SET status = 'declined', updated_at = now()
  WHERE id = p_invite_id
    AND resolved_user_id = auth.uid()
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already processed';
  END IF;
END;
$$;

-- ----------------------------------------
-- Update handle_new_user to also resolve pending invites
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, onboarding_completed)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      ''
    ),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture'),
    false
  );

  -- Resolve any pending invites for this phone number
  PERFORM public.resolve_pending_invites(NEW.id);

  RETURN NEW;
END;
$$;

-- ============================================================
-- RLS Policies for group_invites
-- ============================================================
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

-- Users can read invites resolved to them
CREATE POLICY "Users can read own invites"
  ON public.group_invites FOR SELECT
  USING (resolved_user_id = auth.uid());

-- Group owners/admins can read invites for their groups
CREATE POLICY "Group owners can read group invites"
  ON public.group_invites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_invites.group_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('owner', 'admin')
    )
  );

-- Group owners/admins can insert invites
CREATE POLICY "Group owners can insert invites"
  ON public.group_invites FOR INSERT
  WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_invites.group_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('owner', 'admin')
    )
  );

-- Users can update their own invites (accept/decline via RPC, but allow direct too)
CREATE POLICY "Users can update own invites"
  ON public.group_invites FOR UPDATE
  USING (resolved_user_id = auth.uid());

-- ----------------------------------------
-- Check if a phone number belongs to an existing user
-- Returns the user's UUID or NULL
-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.check_phone_exists(p_phone TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE phone = p_phone LIMIT 1;
  RETURN v_user_id;
END;
$$;
