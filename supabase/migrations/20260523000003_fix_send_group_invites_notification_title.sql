-- Fix: notifications INSERT in send_group_invites omits required title and body columns.
-- Adds v_group_name lookup before the loop and includes title/body in the notification.

CREATE OR REPLACE FUNCTION public.send_group_invites(
  p_group_id UUID,
  p_phones   JSONB   -- [{phone: "10-digit"|"+1…", name: "…"|null}, …]
)
RETURNS TABLE (
  phone             TEXT,
  name              TEXT,
  invite_id         UUID,
  resolved_user_id  UUID,
  is_existing_user  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry       JSONB;
  v_raw_phone   TEXT;
  v_e164_phone  TEXT;
  v_name        TEXT;
  v_invite_id   UUID;
  v_user_id     UUID;
  v_is_existing BOOLEAN;
  v_group_name  TEXT;
BEGIN
  -- Fetch group name once for use in notification copy
  SELECT g.name INTO v_group_name
    FROM public.groups AS g
   WHERE g.id = p_group_id;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_phones)
  LOOP
    v_raw_phone := v_entry->>'phone';
    v_name      := v_entry->>'name';

    -- Normalise to E.164 (+1XXXXXXXXXX)
    v_e164_phone := CASE
      WHEN v_raw_phone LIKE '+%'
        THEN v_raw_phone
      WHEN length(regexp_replace(v_raw_phone, '\D', '', 'g')) = 11
           AND left(regexp_replace(v_raw_phone, '\D', '', 'g'), 1) = '1'
        THEN '+' || regexp_replace(v_raw_phone, '\D', '', 'g')
      ELSE '+1' || regexp_replace(v_raw_phone, '\D', '', 'g')
    END;

    -- Skip obviously invalid numbers (< 12 chars: + 1 + 10 digits)
    IF length(v_e164_phone) < 12 THEN
      CONTINUE;
    END IF;

    -- Resolve to an existing user via auth.users.phone (stored without leading '+')
    SELECT u.id
      INTO v_user_id
      FROM auth.users AS u
     WHERE u.phone = ltrim(v_e164_phone, '+')
     LIMIT 1;

    v_is_existing := (v_user_id IS NOT NULL);

    -- Skip if already a group member
    IF v_is_existing AND EXISTS (
      SELECT 1
        FROM public.group_members AS gm
       WHERE gm.group_id = p_group_id
         AND gm.user_id  = v_user_id
    ) THEN
      CONTINUE;
    END IF;

    -- Check for an existing invite (table-alias-qualified to avoid OUT-param clash)
    SELECT gi.id
      INTO v_invite_id
      FROM public.group_invites AS gi
     WHERE gi.group_id = p_group_id
       AND gi.phone    = v_e164_phone;

    IF FOUND THEN
      UPDATE public.group_invites AS gi
         SET name             = v_name,
             resolved_user_id = v_user_id,
             status           = 'pending',
             expires_at       = now() + interval '7 days'
       WHERE gi.group_id = p_group_id
         AND gi.phone    = v_e164_phone;
    ELSE
      INSERT INTO public.group_invites (
        group_id, phone, name, invited_by, resolved_user_id, status
      )
      VALUES (
        p_group_id, v_e164_phone, v_name, auth.uid(), v_user_id, 'pending'
      )
      RETURNING public.group_invites.id INTO v_invite_id;
    END IF;

    -- In-app notification for existing users (title + body required)
    IF v_is_existing AND v_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_user_id,
        'group_invite',
        'You were invited to a group',
        COALESCE('Join ' || v_group_name, 'You have a new group invite'),
        jsonb_build_object(
          'invite_id', v_invite_id,
          'group_id',  p_group_id
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- Assign output columns (left-hand := is unambiguously the OUT param)
    phone            := v_e164_phone;
    name             := v_name;
    invite_id        := v_invite_id;
    resolved_user_id := v_user_id;
    is_existing_user := v_is_existing;
    RETURN NEXT;
  END LOOP;
END;
$$;
