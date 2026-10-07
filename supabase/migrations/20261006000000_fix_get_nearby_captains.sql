-- Migration: Fix get_nearby_captains to only return online, verified captains that are not already on an active ride.
DROP FUNCTION IF EXISTS public.get_nearby_captains(vehicle_type, double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION public.get_nearby_captains(
  _vehicle vehicle_type,
  _lat double precision,
  _lng double precision,
  _radius_km double precision DEFAULT 5
)
RETURNS TABLE(id uuid, current_lat double precision, current_lng double precision, is_online boolean, distance_km double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    c.id, 
    c.current_lat::double precision, 
    c.current_lng::double precision, 
    c.is_online,
    (6371 * acos(
      cos(radians(_lat)) * cos(radians(c.current_lat)) *
      cos(radians(c.current_lng) - radians(_lng)) +
      sin(radians(_lat)) * sin(radians(c.current_lat))
    )) AS distance_km
  FROM public.captains c
  WHERE c.vehicle_type = _vehicle
    AND c.is_online = true
    AND c.verified = true
    AND c.current_lat IS NOT NULL
    AND c.current_lng IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.captain_id = c.id
        AND r.status IN ('accepted', 'started')
    )
    AND (
      (6371 * acos(
        cos(radians(_lat)) * cos(radians(c.current_lat)) *
        cos(radians(c.current_lng) - radians(_lng)) +
        sin(radians(_lat)) * sin(radians(c.current_lat))
      )) <= _radius_km
      OR _radius_km IS NULL
    )
  ORDER BY distance_km ASC;
$$;
