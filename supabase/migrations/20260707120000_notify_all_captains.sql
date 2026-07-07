-- Migration: Redefine get_nearby_captains to return both online and offline captains of matching vehicle type, with is_online status
CREATE OR REPLACE FUNCTION public.get_nearby_captains(
  _vehicle vehicle_type,
  _lat double precision,
  _lng double precision,
  _radius_km double precision DEFAULT 5
)
RETURNS TABLE(id uuid, current_lat double precision, current_lng double precision, is_online boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.current_lat::double precision, c.current_lng::double precision, c.is_online
  FROM public.captains c
  WHERE c.vehicle_type = _vehicle;
$$;

REVOKE EXECUTE ON FUNCTION public.get_nearby_captains FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_captains TO authenticated;
