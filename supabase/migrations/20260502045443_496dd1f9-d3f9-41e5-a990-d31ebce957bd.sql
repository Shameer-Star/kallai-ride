
-- 1. Fix role self-assignment in handle_new_user trigger (always default to customer)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _requested text;
  _role app_role;
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone'
  );
  _requested := new.raw_user_meta_data->>'role';
  -- Only allow self-assigning customer or captain; never admin.
  if _requested = 'captain' then
    _role := 'captain'::app_role;
  else
    _role := 'customer'::app_role;
  end if;
  insert into public.user_roles (user_id, role) values (new.id, _role);
  return new;
end;
$function$;

-- 2. Tighten user_roles INSERT policy to forbid admin self-assign (already restricted to customer/captain; re-create defensively)
DROP POLICY IF EXISTS "Users insert own non-admin role on signup" ON public.user_roles;
CREATE POLICY "Users insert own non-admin role on signup"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role IN ('customer'::app_role, 'captain'::app_role)
);

-- 3. Server-side fare validation via trigger to prevent client-forged fares
CREATE OR REPLACE FUNCTION public.validate_ride_fare()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  base_fare numeric;
  per_km numeric;
  min_fare numeric;
  expected numeric;
BEGIN
  IF NEW.distance_km IS NULL OR NEW.distance_km <= 0 THEN
    RAISE EXCEPTION 'distance_km must be positive';
  END IF;
  IF NEW.fare IS NULL OR NEW.fare <= 0 THEN
    RAISE EXCEPTION 'fare must be positive';
  END IF;

  IF NEW.vehicle_type::text = 'bike' THEN
    base_fare := 20; per_km := 8; min_fare := 25;
  ELSE
    base_fare := 30; per_km := 12; min_fare := 40;
  END IF;

  expected := GREATEST(min_fare, base_fare + per_km * NEW.distance_km);
  -- Always recompute server-side; ignore client-supplied value
  NEW.fare := round(expected);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_ride_fare ON public.rides;
CREATE TRIGGER trg_validate_ride_fare
BEFORE INSERT ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.validate_ride_fare();

ALTER TABLE public.rides
  DROP CONSTRAINT IF EXISTS rides_fare_distance_positive;
ALTER TABLE public.rides
  ADD CONSTRAINT rides_fare_distance_positive CHECK (fare > 0 AND distance_km > 0);

-- 4. Add DELETE policy for captain-docs storage bucket
DROP POLICY IF EXISTS "Captains delete own docs" ON storage.objects;
CREATE POLICY "Captains delete own docs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'captain-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Also ensure SELECT/INSERT/UPDATE policies exist for captain-docs scoped to owner folder
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Captains read own docs') THEN
    CREATE POLICY "Captains read own docs"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'captain-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Captains upload own docs') THEN
    CREATE POLICY "Captains upload own docs"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'captain-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Captains update own docs') THEN
    CREATE POLICY "Captains update own docs"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'captain-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
