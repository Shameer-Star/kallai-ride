-- Migration: Filter out requested rides older than 20 minutes from browseable view
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
  AND created_at >= now() - interval '20 minutes'
  AND has_role(auth.uid(), 'captain'::app_role);
