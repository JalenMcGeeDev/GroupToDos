-- Fix phone matching to handle +prefix inconsistencies

-- check_phone_exists: strip + from input before comparing
CREATE OR REPLACE FUNCTION public.check_phone_exists(p_phone TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_clean_phone TEXT;
BEGIN
  v_clean_phone := regexp_replace(p_phone, '^\+', '');
  SELECT id INTO v_user_id FROM auth.users
  WHERE regexp_replace(phone, '^\+', '') = v_clean_phone
  LIMIT 1;
  RETURN v_user_id;
END;
$$;

-- resolve_pending_invites: strip + from phone before matching
CREATE OR REPLACE FUNCTION public.resolve_pending_invites(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
  v_clean_phone TEXT;
  v_invite RECORD;
  v_count INTEGER := 0;
BEGIN
  SELECT phone INTO v_phone FROM auth.users WHERE id = p_user_id;
  IF v_phone IS NULL OR v_phone = '' THEN
    RETURN 0;
  END IF;

  v_clean_phone := regexp_replace(v_phone, '^\+', '');

  FOR v_invite IN
    UPDATE public.group_invites
    SET resolved_user_id = p_user_id,
        updated_at = now()
    WHERE regexp_replace(phone, '^\+', '') = v_clean_phone
      AND status = 'pending'
      AND expires_at > now()
      AND resolved_user_id IS NULL
    RETURNING id, group_id, invited_by
  LOOP
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
