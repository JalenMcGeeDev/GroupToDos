-- When a new user signs up, backfill resolved_user_id on any pending invites
-- that match their phone number, and create in-app notifications for each.
--
-- auth.users stores phone without '+' (e.g. "19196386692")
-- group_invites stores phone in E.164 (e.g. "+19196386692")
-- so we compare: group_invites.phone = '+' || NEW.phone

CREATE OR REPLACE FUNCTION public.handle_new_user_invite_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nothing to do if the user signed up without a phone (e.g. email/OAuth)
  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    RETURN NEW;
  END IF;

  -- Link matching pending invites to this new user
  UPDATE public.group_invites
     SET resolved_user_id = NEW.id
   WHERE phone = '+' || NEW.phone
     AND status = 'pending'
     AND resolved_user_id IS NULL
     AND expires_at > now();

  -- Create in-app notifications for each matched invite
  INSERT INTO public.notifications (user_id, type, data)
  SELECT
    NEW.id,
    'group_invite',
    jsonb_build_object('invite_id', gi.id, 'group_id', gi.group_id)
  FROM public.group_invites gi
  WHERE gi.phone = '+' || NEW.phone
    AND gi.status = 'pending'
    AND gi.resolved_user_id = NEW.id
    AND gi.expires_at > now()
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_resolve_invites
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_invite_resolution();
