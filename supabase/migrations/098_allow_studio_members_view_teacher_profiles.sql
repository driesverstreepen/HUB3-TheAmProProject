-- Migration 098: Allow studio admins (studio_members) to view teacher profiles
-- This fixes studio settings > Docenten for non-owner admins when TeachersClient queries user_profiles.

-- Helper: can the current user view a given teacher's profile via a studio link?
-- SECURITY DEFINER avoids RLS recursion / cross-table RLS issues.
CREATE OR REPLACE FUNCTION public.can_view_teacher_profile(target_teacher_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.studio_teachers st
    WHERE st.user_id = target_teacher_user_id
      AND public.is_studio_admin(st.studio_id)
  );
$$;

DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS user_profiles_studio_members_view_teachers ON public.user_profiles;

    CREATE POLICY user_profiles_studio_members_view_teachers
      ON public.user_profiles
      FOR SELECT
      TO authenticated
      USING (public.can_view_teacher_profile(user_profiles.user_id));
  END IF;
END $$;
