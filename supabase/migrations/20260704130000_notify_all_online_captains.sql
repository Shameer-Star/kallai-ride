-- Migration: Redefine get_nearby_captains to return all online captains of matching vehicle type, ignoring verification status and radius
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
    AND c.current_lat IS NOT NULL 
    AND c.current_lng IS NOT NULL;
$$;
