-- Migration: Invalidate OTP on successful verification to prevent reuse
CREATE OR REPLACE FUNCTION public.verify_ride_otp(_ride_id uuid, _otp text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stored text;
  _captain uuid;
  _status ride_status;
BEGIN
  SELECT otp, captain_id, status INTO _stored, _captain, _status
  FROM public.rides WHERE id = _ride_id;
  IF _captain IS NULL OR _captain <> auth.uid() THEN
    RETURN false;
  END IF;
  IF _status <> 'accepted'::ride_status THEN
    RETURN false;
  END IF;
  IF _stored IS NULL OR _stored <> _otp THEN
    RETURN false;
  END IF;
  UPDATE public.rides
    SET status = 'started'::ride_status, started_at = now(), otp = NULL
    WHERE id = _ride_id;
  RETURN true;
END;
$$;
