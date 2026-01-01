-- Add logo_url column to studios table and storage policies for studio logos
-- This allows each studio to have their own logo uploaded by studio admins

-- Add logo_url column to studios table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'studios' AND column_name = 'logo_url') THEN
    ALTER TABLE public.studios ADD COLUMN logo_url TEXT;
  END IF;
END $$;

-- Storage policies for studio_logos bucket (individual studio logos)
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "studio_logos_bucket_studio_admin_upload" ON storage.objects;
DROP POLICY IF EXISTS "studio_logos_bucket_studio_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "studio_logos_bucket_studio_admin_delete" ON storage.objects;
DROP POLICY IF EXISTS "studio_logos_bucket_public_select" ON storage.objects;

-- Allow studio admins to upload logos for their own studio
CREATE POLICY "studio_logos_bucket_studio_admin_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'studio_logos' AND
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.studios s ON ur.studio_id = s.id
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'studio_admin'
      AND s.id::text = (storage.foldername(name))[1]
    )
  );

-- Allow studio admins to update/delete logos for their own studio
CREATE POLICY "studio_logos_bucket_studio_admin_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'studio_logos' AND
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.studios s ON ur.studio_id = s.id
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'studio_admin'
      AND s.id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "studio_logos_bucket_studio_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'studio_logos' AND
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.studios s ON ur.studio_id = s.id
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'studio_admin'
      AND s.id::text = (storage.foldername(name))[1]
    )
  );

-- Allow everyone to view studio logos (public access for studio profiles)
CREATE POLICY "studio_logos_bucket_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'studio_logos');