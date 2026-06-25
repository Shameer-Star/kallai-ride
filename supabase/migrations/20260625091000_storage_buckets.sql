-- Migration: Storage Buckets Configuration

-- Create buckets if they do not exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('profile-images', 'profile-images', false),
  ('licenses', 'licenses', false),
  ('vehicle-documents', 'vehicle-documents', false),
  ('ride-proofs', 'ride-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage.objects in these buckets

-- profile-images policies
CREATE POLICY "Users read own profile images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users upload own profile images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update/delete own profile images" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- licenses policies
CREATE POLICY "Captains read own licenses" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'licenses' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Captains upload own licenses" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'licenses' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Captains update/delete own licenses" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'licenses' AND (storage.foldername(name))[1] = auth.uid()::text);

-- vehicle-documents policies
CREATE POLICY "Captains read own vehicle-documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Captains upload own vehicle-documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Captains update/delete own vehicle-documents" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'vehicle-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ride-proofs policies
CREATE POLICY "Ride participants read proofs" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ride-proofs' 
    AND EXISTS (
      SELECT 1 FROM public.rides r 
      WHERE r.id::text = (storage.foldername(name))[1] 
        AND (r.customer_id = auth.uid() OR r.captain_id = auth.uid())
    )
  );

CREATE POLICY "Captains upload ride proofs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ride-proofs'
    AND EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.id::text = (storage.foldername(name))[1]
        AND r.captain_id = auth.uid()
    )
  );

-- Admins read all objects in new buckets
CREATE POLICY "Admins read profile-images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-images' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins read licenses" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'licenses' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins read vehicle-documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-documents' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins read ride-proofs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ride-proofs' AND public.has_role(auth.uid(), 'admin'::app_role));
