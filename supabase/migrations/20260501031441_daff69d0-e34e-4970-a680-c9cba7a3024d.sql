REVOKE EXECUTE ON FUNCTION public.handle_captain_cancellation() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_ride_completion() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_ride_otp() FROM public, anon, authenticated;