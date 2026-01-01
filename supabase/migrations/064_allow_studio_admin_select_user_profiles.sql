-- Migration: Allow studio_admins to SELECT user_profiles for users related to their studio
-- This policy enables studio admins to view profile information for users that are
-- connected to their studio via enrollments (inschrijvingen) or user_roles.

BEGIN;

-- Be safe: remove conflicting policies
DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;
DROP POLICY IF EXISTS "Studio admins can view user profiles" ON public.user_profiles;

-- Re-create owner policy: users can still view their own profile
CREATE POLICY "user_profiles_select_own" ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = user_profiles.user_id);

-- Policy: Studio admins can view user_profiles for users who have enrollments in their studio
CREATE POLICY "Studio admins can view user profiles"
  ON public.user_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.inschrijvingen i
      JOIN public.programs p ON p.id = i.program_id
      JOIN public.user_roles ur ON ur.studio_id = p.studio_id
      WHERE i.user_id = user_profiles.user_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'studio_admin'
    )
  );

COMMIT;

-- End migration
