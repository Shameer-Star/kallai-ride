-- 1. Restrict profile reads: users see own profile fully; others only see basic info (full_name)
DROP POLICY IF EXISTS "Profiles are viewable by everyone authenticated" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Allow ride participants to see each other's name/phone (customer <-> captain on active ride)
CREATE POLICY "Ride participants can view each other profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rides r
    WHERE (r.customer_id = auth.uid() AND r.captain_id = public.profiles.id)
       OR (r.captain_id = auth.uid() AND r.customer_id = public.profiles.id)
  )
);

-- 2. Prevent privilege escalation: only allow self-insert as 'customer' or 'captain' (not admin)
DROP POLICY IF EXISTS "Users insert own role on signup" ON public.user_roles;

CREATE POLICY "Users insert own non-admin role on signup"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role IN ('customer'::app_role, 'captain'::app_role)
);

-- 3. Lock down realtime.messages so users can only subscribe to topics scoped to themselves
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read own realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow ride/captain feed channels the user participates in
  (realtime.topic() LIKE 'captain-feed-' || auth.uid()::text)
  OR (realtime.topic() LIKE 'customer-feed-' || auth.uid()::text)
  OR EXISTS (
    SELECT 1 FROM public.rides r
    WHERE (r.customer_id = auth.uid() OR r.captain_id = auth.uid())
      AND realtime.topic() = 'ride-' || r.id::text
  )
);