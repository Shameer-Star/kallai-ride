-- Bootstrap admin role for the dedicated kallairideadmin account
CREATE OR REPLACE FUNCTION public.bootstrap_admin(_passcode text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  IF _email <> 'kallairideadmin@kallai.ride' THEN
    RETURN false;
  END IF;
  IF _passcode <> 'ride123' THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  -- Remove default customer role if it was auto-added
  DELETE FROM public.user_roles WHERE user_id = _uid AND role = 'customer'::app_role;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_admin(text) TO authenticated;