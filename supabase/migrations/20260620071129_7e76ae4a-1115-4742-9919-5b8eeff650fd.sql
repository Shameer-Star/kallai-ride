
-- 1. Restore table-level GRANTs (lost previously; causes "permission denied for table rides")
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.captains TO authenticated;
GRANT ALL ON public.captains TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides TO authenticated;
GRANT ALL ON public.rides TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cancellations TO authenticated;
GRANT ALL ON public.cancellations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_locations TO authenticated;
GRANT ALL ON public.favorite_locations TO service_role;

-- 2. Re-revoke sensitive columns on rides from authenticated; keep them readable only via SECURITY DEFINER RPCs
REVOKE SELECT (otp, sender_phone, receiver_phone) ON public.rides FROM authenticated;

-- 3. Allow admins to view all profiles (needed for admin dashboard to see captain real names/phones)
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Allow admins to read captain documents from storage
DROP POLICY IF EXISTS "Admins read captain docs" ON storage.objects;
CREATE POLICY "Admins read captain docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'captain-docs' AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Captain upload own docs" ON storage.objects;
CREATE POLICY "Captain upload own docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'captain-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Captain read own docs" ON storage.objects;
CREATE POLICY "Captain read own docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'captain-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
