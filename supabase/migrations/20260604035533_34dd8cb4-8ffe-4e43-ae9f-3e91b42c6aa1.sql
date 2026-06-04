
-- 1. Ratings table
CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL UNIQUE,
  customer_id uuid NOT NULL,
  captain_id uuid NOT NULL,
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customer inserts own rating"
ON public.ratings FOR INSERT TO authenticated
WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Ride participants and admins view ratings"
ON public.ratings FOR SELECT TO authenticated
USING (
  customer_id = auth.uid()
  OR captain_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Trigger to update captain's average rating
CREATE OR REPLACE FUNCTION public.update_captain_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avg_rating numeric;
BEGIN
  SELECT AVG(stars)::numeric(3,2) INTO avg_rating
  FROM public.ratings WHERE captain_id = NEW.captain_id;
  UPDATE public.captains SET rating = COALESCE(avg_rating, 5.0)
  WHERE id = NEW.captain_id;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.update_captain_rating() FROM public, authenticated;

CREATE TRIGGER trg_update_captain_rating
AFTER INSERT ON public.ratings
FOR EACH ROW EXECUTE FUNCTION public.update_captain_rating();

-- 2. Favorite locations
CREATE TABLE public.favorite_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  address text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_locations TO authenticated;
GRANT ALL ON public.favorite_locations TO service_role;

ALTER TABLE public.favorite_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own favorites"
ON public.favorite_locations FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 3. Admin access policies for monitoring
CREATE POLICY "Admins view all rides"
ON public.rides FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins view all cancellations"
ON public.cancellations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update captains"
ON public.captains FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins view all user_roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
