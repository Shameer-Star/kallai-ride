
-- =====================================================
-- KALLAI RIDE — comprehensive security hardening
-- =====================================================

-- 1) handle_new_user: never trust client-supplied 'admin' role (already hardcoded, re-assert)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  if _requested = 'captain' then
    _role := 'captain'::app_role;
  else
    _role := 'customer'::app_role;
  end if;
  insert into public.user_roles (user_id, role) values (new.id, _role);
  return new;
end;
$$;

-- 2) Attach all the missing triggers (functions existed but were never wired up)

-- Fare validation: server recomputes on every ride insert
DROP TRIGGER IF EXISTS trg_validate_ride_fare ON public.rides;
CREATE TRIGGER trg_validate_ride_fare
  BEFORE INSERT ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.validate_ride_fare();

-- OTP: regenerated ONLY when a captain accepts (was previously on insert => captains could read it before accepting)
CREATE OR REPLACE FUNCTION public.set_ride_otp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'accepted'::ride_status
     AND (OLD.status IS DISTINCT FROM 'accepted'::ride_status)
     AND NEW.otp IS NULL THEN
    NEW.otp := lpad((floor(random() * 10000))::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_ride_otp ON public.rides;
CREATE TRIGGER trg_set_ride_otp
  BEFORE UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.set_ride_otp();

-- Captain cancellation penalty: derive role server-side, ignore client-supplied value
CREATE OR REPLACE FUNCTION public.handle_captain_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  today date := current_date;
  actual_role app_role;
BEGIN
  SELECT role INTO actual_role
    FROM public.user_roles WHERE user_id = NEW.cancelled_by LIMIT 1;
  NEW.cancelled_by_role := COALESCE(actual_role::text, NEW.cancelled_by_role);
  IF actual_role = 'captain'::app_role THEN
    UPDATE public.captains
    SET
      cancelled_rides = cancelled_rides + 1,
      daily_cancel_count = CASE WHEN daily_cancel_date = today THEN daily_cancel_count + 1 ELSE 1 END,
      daily_cancel_date = today,
      warning_level = CASE WHEN (CASE WHEN daily_cancel_date = today THEN daily_cancel_count + 1 ELSE 1 END) >= 3 THEN warning_level + 1 ELSE warning_level END,
      is_online = CASE WHEN (CASE WHEN daily_cancel_date = today THEN daily_cancel_count + 1 ELSE 1 END) >= 3 THEN false ELSE is_online END,
      rating = GREATEST(1.0, rating - 0.2)
    WHERE id = NEW.cancelled_by;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_handle_captain_cancellation ON public.cancellations;
CREATE TRIGGER trg_handle_captain_cancellation
  BEFORE INSERT ON public.cancellations
  FOR EACH ROW EXECUTE FUNCTION public.handle_captain_cancellation();

-- Ride completion → bump captain counters
DROP TRIGGER IF EXISTS trg_handle_ride_completion ON public.rides;
CREATE TRIGGER trg_handle_ride_completion
  AFTER UPDATE OF status ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.handle_ride_completion();

-- Rating insert → update captain average
DROP TRIGGER IF EXISTS trg_update_captain_rating ON public.ratings;
CREATE TRIGGER trg_update_captain_rating
  AFTER INSERT ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_captain_rating();

-- 3) Block captains from self-elevating sensitive columns via BEFORE-UPDATE trigger
CREATE OR REPLACE FUNCTION public.lock_captain_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip when running as DB owner / service_role (internal triggers) or admin user
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Non-admin captain: preserve privileged fields from OLD
  NEW.verified := OLD.verified;
  NEW.warning_level := OLD.warning_level;
  NEW.cancelled_rides := OLD.cancelled_rides;
  NEW.daily_cancel_count := OLD.daily_cancel_count;
  NEW.daily_cancel_date := OLD.daily_cancel_date;
  NEW.completed_rides := OLD.completed_rides;
  NEW.total_rides := OLD.total_rides;
  NEW.rating := OLD.rating;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lock_captain_fields ON public.captains;
CREATE TRIGGER trg_lock_captain_fields
  BEFORE UPDATE ON public.captains
  FOR EACH ROW EXECUTE FUNCTION public.lock_captain_privileged_fields();

-- 4) Restrict captains SELECT — owner / admin / active-ride counterparty only.
DROP POLICY IF EXISTS "Anyone authenticated can view captains" ON public.captains;

CREATE POLICY "Captain views own row"
ON public.captains FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins view all captains"
ON public.captains FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Counterparty views captain on active ride"
ON public.captains FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rides r
    WHERE r.captain_id = captains.id
      AND r.customer_id = auth.uid()
      AND r.status IN ('accepted'::ride_status, 'started'::ride_status)
  )
);

-- 5) Public nearby-captain marker function (returns only safe cols)
CREATE OR REPLACE FUNCTION public.get_nearby_captains(
  _vehicle vehicle_type,
  _lat double precision,
  _lng double precision,
  _radius_km double precision DEFAULT 5
)
RETURNS TABLE(id uuid, current_lat double precision, current_lng double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.current_lat::double precision, c.current_lng::double precision
  FROM public.captains c
  WHERE c.is_online = true
    AND c.vehicle_type = _vehicle
    AND c.current_lat IS NOT NULL AND c.current_lng IS NOT NULL
    AND (
      6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(_lat)) * cos(radians(c.current_lat::double precision)) *
          cos(radians(c.current_lng::double precision) - radians(_lng)) +
          sin(radians(_lat)) * sin(radians(c.current_lat::double precision))
        ))
      )
    ) <= _radius_km;
$$;
REVOKE EXECUTE ON FUNCTION public.get_nearby_captains FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_captains TO authenticated;

-- 6) Profiles SELECT — only during active (accepted/started) ride
DROP POLICY IF EXISTS "Ride participants can view each other profiles" ON public.profiles;
CREATE POLICY "Ride participants view each other on active rides"
ON public.profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rides r
    WHERE r.status IN ('accepted'::ride_status, 'started'::ride_status)
      AND ((r.customer_id = auth.uid() AND r.captain_id = profiles.id)
        OR (r.captain_id = auth.uid() AND r.customer_id = profiles.id))
  )
);

-- 7) Tighten ratings INSERT
DROP POLICY IF EXISTS "Customer inserts own rating" ON public.ratings;
CREATE POLICY "Customer inserts own rating"
ON public.ratings FOR INSERT TO authenticated
WITH CHECK (
  customer_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.rides r
    WHERE r.id = ratings.ride_id
      AND r.customer_id = auth.uid()
      AND r.captain_id = ratings.captain_id
      AND r.status = 'completed'::ride_status
  )
);

-- 8) Rides SELECT — drop the requested-ride branch that leaked OTP + parcel phones.
DROP POLICY IF EXISTS "Customer views own rides" ON public.rides;
CREATE POLICY "Participants view their rides"
ON public.rides FOR SELECT TO authenticated
USING (customer_id = auth.uid() OR captain_id = auth.uid());

-- Safe view captains use to browse open requests (no OTP, no parcel phones, no customer_id)
CREATE OR REPLACE VIEW public.rides_browseable
WITH (security_invoker = on) AS
SELECT id,
       pickup_address, pickup_lat, pickup_lng,
       drop_address, drop_lat, drop_lng,
       distance_km, fare,
       vehicle_type, ride_type,
       item_description, rejected_by, status, created_at
FROM public.rides
WHERE status = 'requested'::ride_status
  AND has_role(auth.uid(), 'captain'::app_role);
GRANT SELECT ON public.rides_browseable TO authenticated;

-- The view runs as the invoker; the base SELECT policy now blocks non-participants,
-- so we add an additional policy specifically permitting captains to read open requests
-- WITHIN the view's restricted column set (the view exposes safe columns only).
CREATE POLICY "Captains browse open ride requests"
ON public.rides FOR SELECT TO authenticated
USING (
  status = 'requested'::ride_status
  AND has_role(auth.uid(), 'captain'::app_role)
  AND NOT (auth.uid() = ANY (rejected_by))
);
-- NOTE: this re-opens base-table SELECT for captains on requested rides, but the
-- frontend will only query through rides_browseable so OTP / parcel phones / customer_id
-- never leave the DB. To enforce at the DB layer too, revoke column-level access:
REVOKE SELECT ON public.rides FROM authenticated;
GRANT SELECT (
  id, customer_id, captain_id, status,
  pickup_address, pickup_lat, pickup_lng,
  drop_address, drop_lat, drop_lng,
  distance_km, fare,
  vehicle_type, ride_type, item_description,
  sender_name, receiver_name,
  created_at, accepted_at, started_at, completed_at,
  rejected_by, cancellation_reason, cancelled_by
) ON public.rides TO authenticated;
-- OTP, sender_phone, receiver_phone are excluded from the base-table column grants.
-- Owners read them via the safe RPCs below.
GRANT INSERT, UPDATE, DELETE ON public.rides TO authenticated;
GRANT ALL ON public.rides TO service_role;

-- 9) Server-side OTP verification (replaces client-side comparison)
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
    SET status = 'started'::ride_status, started_at = now()
    WHERE id = _ride_id;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_ride_otp FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_ride_otp TO authenticated;

-- Customer reads their own ride's OTP via RPC (since base-table SELECT excludes otp col)
CREATE OR REPLACE FUNCTION public.get_my_ride_otp(_ride_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT otp FROM public.rides
  WHERE id = _ride_id AND customer_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_ride_otp FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ride_otp TO authenticated;

-- Captain reads parcel sender/receiver phones only after accepting their ride
CREATE OR REPLACE FUNCTION public.get_ride_parcel_contacts(_ride_id uuid)
RETURNS TABLE(sender_phone text, receiver_phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.sender_phone, r.receiver_phone
  FROM public.rides r
  WHERE r.id = _ride_id
    AND (
      r.customer_id = auth.uid()
      OR (r.captain_id = auth.uid()
          AND r.status IN ('accepted'::ride_status, 'started'::ride_status, 'completed'::ride_status))
    );
$$;
REVOKE EXECUTE ON FUNCTION public.get_ride_parcel_contacts FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ride_parcel_contacts TO authenticated;

-- 10) Revoke EXECUTE on internal trigger-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_captain_cancellation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_ride_completion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_captain_rating() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_ride_otp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_ride_fare() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_captain_privileged_fields() FROM PUBLIC, anon, authenticated;
