
-- Revoke EXECUTE from public/authenticated/anon for trigger-only SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_captain_cancellation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_ride_completion() FROM PUBLIC, anon, authenticated;
