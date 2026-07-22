-- Fix: Ensure admin can read all storage buckets
-- The original migration may have failed if policies already existed from earlier migrations.
-- This migration drops and recreates admin read policies to guarantee they exist.

-- Drop existing admin storage policies (safe if they don't exist)
DROP POLICY IF EXISTS "Admins read profile-images" ON storage.objects;
DROP POLICY IF EXISTS "Admins read licenses" ON storage.objects;
DROP POLICY IF EXISTS "Admins read vehicle-documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins read ride-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins read captain-docs" ON storage.objects;

-- Recreate admin storage policies
CREATE POLICY "Admins read profile-images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-images' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins read licenses" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'licenses' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins read vehicle-documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-documents' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins read ride-proofs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ride-proofs' AND public.has_role(auth.uid(), 'admin'::app_role));

-- Also allow admin to read legacy captain-docs bucket (from the earliest migration)
CREATE POLICY "Admins read captain-docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'captain-docs' AND public.has_role(auth.uid(), 'admin'::app_role));

-- Ensure buckets exist (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('profile-images', 'profile-images', false),
  ('licenses', 'licenses', false),
  ('vehicle-documents', 'vehicle-documents', false),
  ('ride-proofs', 'ride-proofs', false)
ON CONFLICT (id) DO NOTHING;
