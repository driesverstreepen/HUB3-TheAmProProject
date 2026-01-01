-- Migration: Fix locations RLS policy for studio admins
-- This migration ensures studio admins can manage locations for their studios

BEGIN;

-- First, let's check the current policy
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'locations';

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Studio admins can view their studio's locations" ON public.locations;
DROP POLICY IF EXISTS "Studio admins can insert locations for their studio" ON public.locations;
DROP POLICY IF EXISTS "Studio admins can update their studio's locations" ON public.locations;
DROP POLICY IF EXISTS "Studio admins can delete their studio's locations" ON public.locations;

-- Recreate policies with proper checks
-- Studio admins can view their own studio's locations
CREATE POLICY "Studio admins can view their studio's locations"
  ON public.locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = locations.studio_id
    )
  );

-- Studio admins can insert locations for their studio
CREATE POLICY "Studio admins can insert locations for their studio"
  ON public.locations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = locations.studio_id
    )
  );

-- Studio admins can update their studio's locations
CREATE POLICY "Studio admins can update their studio's locations"
  ON public.locations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = locations.studio_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = locations.studio_id
    )
  );

-- Studio admins can delete their studio's locations
CREATE POLICY "Studio admins can delete their studio's locations"
  ON public.locations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = locations.studio_id
    )
  );

COMMIT;

-- END OF MIGRATION