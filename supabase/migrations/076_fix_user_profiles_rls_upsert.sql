-- Fix user_profiles RLS policies to allow photo_url updates via upsert
-- The issue is that the UPDATE policy's WITH CHECK clause may fail when only partial fields are updated

-- Add photo_url column to user_profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'photo_url') THEN
    ALTER TABLE public.user_profiles ADD COLUMN photo_url TEXT;
  END IF;
END $$;

-- Drop the problematic update policy and recreate it
DROP POLICY IF EXISTS "user_profiles_update_own" ON public.user_profiles;

-- Drop existing policies
DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_own" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert_own" ON public.user_profiles;

-- Allow users to select their own profile
CREATE POLICY "user_profiles_select_own" ON public.user_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Allow users to insert their own profile
CREATE POLICY "user_profiles_insert_own" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own profile (more permissive)
CREATE POLICY "user_profiles_update_own" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Storage policies for studio_logos bucket (site logos uploaded by admins)
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "studio_logos_bucket_super_admin_upload" ON storage.objects;
DROP POLICY IF EXISTS "studio_logos_bucket_super_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "studio_logos_bucket_super_admin_delete" ON storage.objects;
DROP POLICY IF EXISTS "studio_logos_bucket_public_select" ON storage.objects;

-- Allow super admins and studio admins to upload logos
CREATE POLICY "studio_logos_bucket_super_admin_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'studio_logos' AND
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'studio_admin')
    )
  );

-- Allow super admins and studio admins to update/delete logos
CREATE POLICY "studio_logos_bucket_super_admin_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'studio_logos' AND
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'studio_admin')
    )
  );

CREATE POLICY "studio_logos_bucket_super_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'studio_logos' AND
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'studio_admin')
    )
  );

-- Allow everyone to view logos (public access)
CREATE POLICY "studio_logos_bucket_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'studio_logos');

-- Storage policies for user_avatars bucket (user profile photos)
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "user_avatars_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "user_avatars_own_update" ON storage.objects;
DROP POLICY IF EXISTS "user_avatars_own_delete" ON storage.objects;
DROP POLICY IF EXISTS "user_avatars_public_select" ON storage.objects;

-- Allow authenticated users to upload their own avatars
CREATE POLICY "user_avatars_authenticated_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user_avatars' AND
    auth.role() = 'authenticated'
  );

-- Allow users to update/delete their own avatars
CREATE POLICY "user_avatars_own_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'user_avatars' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "user_avatars_own_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'user_avatars' AND
    auth.role() = 'authenticated'
  );

-- Allow everyone to view avatars (public access for profile display)
CREATE POLICY "user_avatars_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'user_avatars');