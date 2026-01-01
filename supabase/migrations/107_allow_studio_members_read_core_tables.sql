-- Migration 107: Allow studio members (any role) to read core studio tables
-- Goal: being added to a studio should not be blocked by RLS for reading studio data.

-- Helper: any studio team member OR studio owner
CREATE OR REPLACE FUNCTION public.is_studio_member(target_studio_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.studios s
    WHERE s.id = target_studio_id
      AND s.eigenaar_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.studio_members sm
    WHERE sm.studio_id = target_studio_id
      AND sm.user_id = auth.uid()
  );
END;
$$;

-- Studios: allow members to read the studio row
DO $$
BEGIN
  IF to_regclass('public.studios') IS NOT NULL THEN
    DROP POLICY IF EXISTS studios_select_studio_admins ON public.studios;
    DROP POLICY IF EXISTS studios_select_studio_members ON public.studios;

    CREATE POLICY studios_select_studio_members
      ON public.studios
      FOR SELECT
      TO authenticated
      USING (public.is_studio_member(id));
  END IF;
END $$;

-- Locations: allow members to read
DO $$
BEGIN
  IF to_regclass('public.locations') IS NOT NULL THEN
    DROP POLICY IF EXISTS locations_select_studio_admins ON public.locations;
    DROP POLICY IF EXISTS "Studio admins can view their studio's locations" ON public.locations;
    DROP POLICY IF EXISTS locations_select_studio_members ON public.locations;

    CREATE POLICY locations_select_studio_members
      ON public.locations
      FOR SELECT
      TO authenticated
      USING (public.is_studio_member(studio_id));
  END IF;
END $$;

-- Forms: allow members to read
DO $$
BEGIN
  IF to_regclass('public.forms') IS NOT NULL THEN
    DROP POLICY IF EXISTS forms_select_studio_admins ON public.forms;
    DROP POLICY IF EXISTS forms_select_studio_members ON public.forms;

    CREATE POLICY forms_select_studio_members
      ON public.forms
      FOR SELECT
      TO authenticated
      USING (public.is_studio_member(studio_id));
  END IF;
END $$;

-- Teachers: allow members to read
DO $$
BEGIN
  IF to_regclass('public.teachers') IS NOT NULL THEN
    DROP POLICY IF EXISTS teachers_select_studio_admins ON public.teachers;
    DROP POLICY IF EXISTS teachers_select_studio_members ON public.teachers;

    CREATE POLICY teachers_select_studio_members
      ON public.teachers
      FOR SELECT
      TO authenticated
      USING (public.is_studio_member(studio_id));
  END IF;
END $$;

-- Studio policies: allow members to read
DO $$
BEGIN
  IF to_regclass('public.studio_policies') IS NOT NULL THEN
    DROP POLICY IF EXISTS studio_policies_select_studio_admins ON public.studio_policies;
    DROP POLICY IF EXISTS "studio_policies_studio_admin_select" ON public.studio_policies;
    DROP POLICY IF EXISTS studio_policies_select_studio_members ON public.studio_policies;

    CREATE POLICY studio_policies_select_studio_members
      ON public.studio_policies
      FOR SELECT
      TO authenticated
      USING (public.is_studio_member(studio_id));
  END IF;
END $$;
