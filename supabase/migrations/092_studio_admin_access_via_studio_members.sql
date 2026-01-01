-- Migration 092: Allow studio admins (studio_members) full access
-- Adds RLS policies based on studio_members (owner/admin) instead of legacy user_roles.

-- Helper: checks whether the current auth user can manage a studio.
-- SECURITY DEFINER is used to avoid recursive RLS when referencing studio_members inside policies.
CREATE OR REPLACE FUNCTION public.is_studio_admin(target_studio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.studio_members sm
      WHERE sm.studio_id = target_studio_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = target_studio_id
        AND s.eigenaar_id = auth.uid()
    );
$$;

DO $$
BEGIN
  -- studios
  IF to_regclass('public.studios') IS NOT NULL THEN
    -- Read
    DROP POLICY IF EXISTS studios_select_studio_admins ON public.studios;
    CREATE POLICY studios_select_studio_admins
      ON public.studios
      FOR SELECT
      TO authenticated
      USING (public.is_studio_admin(id));

    -- Write
    DROP POLICY IF EXISTS studios_update_studio_admins ON public.studios;
    CREATE POLICY studios_update_studio_admins
      ON public.studios
      FOR UPDATE
      TO authenticated
      USING (public.is_studio_admin(id))
      WITH CHECK (public.is_studio_admin(id));
  END IF;

  -- programs
  IF to_regclass('public.programs') IS NOT NULL THEN
    DROP POLICY IF EXISTS programs_select_studio_admins ON public.programs;
    CREATE POLICY programs_select_studio_admins
      ON public.programs
      FOR SELECT
      TO authenticated
      USING (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS programs_insert_studio_admins ON public.programs;
    CREATE POLICY programs_insert_studio_admins
      ON public.programs
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS programs_update_studio_admins ON public.programs;
    CREATE POLICY programs_update_studio_admins
      ON public.programs
      FOR UPDATE
      TO authenticated
      USING (public.is_studio_admin(studio_id))
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS programs_delete_studio_admins ON public.programs;
    CREATE POLICY programs_delete_studio_admins
      ON public.programs
      FOR DELETE
      TO authenticated
      USING (public.is_studio_admin(studio_id));
  END IF;

  -- lessons (via programs.studio_id)
  IF to_regclass('public.lessons') IS NOT NULL AND to_regclass('public.programs') IS NOT NULL THEN
    DROP POLICY IF EXISTS lessons_select_studio_admins ON public.lessons;
    CREATE POLICY lessons_select_studio_admins
      ON public.lessons
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = public.lessons.program_id
            AND public.is_studio_admin(p.studio_id)
        )
      );

    DROP POLICY IF EXISTS lessons_insert_studio_admins ON public.lessons;
    CREATE POLICY lessons_insert_studio_admins
      ON public.lessons
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = public.lessons.program_id
            AND public.is_studio_admin(p.studio_id)
        )
      );

    DROP POLICY IF EXISTS lessons_update_studio_admins ON public.lessons;
    CREATE POLICY lessons_update_studio_admins
      ON public.lessons
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = public.lessons.program_id
            AND public.is_studio_admin(p.studio_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = public.lessons.program_id
            AND public.is_studio_admin(p.studio_id)
        )
      );

    DROP POLICY IF EXISTS lessons_delete_studio_admins ON public.lessons;
    CREATE POLICY lessons_delete_studio_admins
      ON public.lessons
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = public.lessons.program_id
            AND public.is_studio_admin(p.studio_id)
        )
      );
  END IF;

  -- locations
  IF to_regclass('public.locations') IS NOT NULL THEN
    DROP POLICY IF EXISTS locations_select_studio_admins ON public.locations;
    CREATE POLICY locations_select_studio_admins
      ON public.locations
      FOR SELECT
      TO authenticated
      USING (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS locations_insert_studio_admins ON public.locations;
    CREATE POLICY locations_insert_studio_admins
      ON public.locations
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS locations_update_studio_admins ON public.locations;
    CREATE POLICY locations_update_studio_admins
      ON public.locations
      FOR UPDATE
      TO authenticated
      USING (public.is_studio_admin(studio_id))
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS locations_delete_studio_admins ON public.locations;
    CREATE POLICY locations_delete_studio_admins
      ON public.locations
      FOR DELETE
      TO authenticated
      USING (public.is_studio_admin(studio_id));
  END IF;

  -- forms
  IF to_regclass('public.forms') IS NOT NULL THEN
    DROP POLICY IF EXISTS forms_select_studio_admins ON public.forms;
    CREATE POLICY forms_select_studio_admins
      ON public.forms
      FOR SELECT
      TO authenticated
      USING (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS forms_insert_studio_admins ON public.forms;
    CREATE POLICY forms_insert_studio_admins
      ON public.forms
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS forms_update_studio_admins ON public.forms;
    CREATE POLICY forms_update_studio_admins
      ON public.forms
      FOR UPDATE
      TO authenticated
      USING (public.is_studio_admin(studio_id))
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS forms_delete_studio_admins ON public.forms;
    CREATE POLICY forms_delete_studio_admins
      ON public.forms
      FOR DELETE
      TO authenticated
      USING (public.is_studio_admin(studio_id));
  END IF;

  -- teachers
  IF to_regclass('public.teachers') IS NOT NULL THEN
    DROP POLICY IF EXISTS teachers_select_studio_admins ON public.teachers;
    CREATE POLICY teachers_select_studio_admins
      ON public.teachers
      FOR SELECT
      TO authenticated
      USING (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS teachers_insert_studio_admins ON public.teachers;
    CREATE POLICY teachers_insert_studio_admins
      ON public.teachers
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS teachers_update_studio_admins ON public.teachers;
    CREATE POLICY teachers_update_studio_admins
      ON public.teachers
      FOR UPDATE
      TO authenticated
      USING (public.is_studio_admin(studio_id))
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS teachers_delete_studio_admins ON public.teachers;
    CREATE POLICY teachers_delete_studio_admins
      ON public.teachers
      FOR DELETE
      TO authenticated
      USING (public.is_studio_admin(studio_id));
  END IF;

  -- studio_policies
  IF to_regclass('public.studio_policies') IS NOT NULL THEN
    DROP POLICY IF EXISTS studio_policies_select_studio_admins ON public.studio_policies;
    CREATE POLICY studio_policies_select_studio_admins
      ON public.studio_policies
      FOR SELECT
      TO authenticated
      USING (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS studio_policies_insert_studio_admins ON public.studio_policies;
    CREATE POLICY studio_policies_insert_studio_admins
      ON public.studio_policies
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS studio_policies_update_studio_admins ON public.studio_policies;
    CREATE POLICY studio_policies_update_studio_admins
      ON public.studio_policies
      FOR UPDATE
      TO authenticated
      USING (public.is_studio_admin(studio_id))
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS studio_policies_delete_studio_admins ON public.studio_policies;
    CREATE POLICY studio_policies_delete_studio_admins
      ON public.studio_policies
      FOR DELETE
      TO authenticated
      USING (public.is_studio_admin(studio_id));
  END IF;

  -- studio_members (team management)
  IF to_regclass('public.studio_members') IS NOT NULL THEN
    DROP POLICY IF EXISTS studio_members_select_studio_admins ON public.studio_members;
    CREATE POLICY studio_members_select_studio_admins
      ON public.studio_members
      FOR SELECT
      TO authenticated
      USING (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS studio_members_insert_studio_admins ON public.studio_members;
    CREATE POLICY studio_members_insert_studio_admins
      ON public.studio_members
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS studio_members_update_studio_admins ON public.studio_members;
    CREATE POLICY studio_members_update_studio_admins
      ON public.studio_members
      FOR UPDATE
      TO authenticated
      USING (public.is_studio_admin(studio_id))
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS studio_members_delete_studio_admins ON public.studio_members;
    CREATE POLICY studio_members_delete_studio_admins
      ON public.studio_members
      FOR DELETE
      TO authenticated
      USING (public.is_studio_admin(studio_id));
  END IF;

  -- studio_invites (team invites)
  IF to_regclass('public.studio_invites') IS NOT NULL THEN
    DROP POLICY IF EXISTS studio_invites_select_studio_admins ON public.studio_invites;
    CREATE POLICY studio_invites_select_studio_admins
      ON public.studio_invites
      FOR SELECT
      TO authenticated
      USING (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS studio_invites_insert_studio_admins ON public.studio_invites;
    CREATE POLICY studio_invites_insert_studio_admins
      ON public.studio_invites
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS studio_invites_update_studio_admins ON public.studio_invites;
    CREATE POLICY studio_invites_update_studio_admins
      ON public.studio_invites
      FOR UPDATE
      TO authenticated
      USING (public.is_studio_admin(studio_id))
      WITH CHECK (public.is_studio_admin(studio_id));

    DROP POLICY IF EXISTS studio_invites_delete_studio_admins ON public.studio_invites;
    CREATE POLICY studio_invites_delete_studio_admins
      ON public.studio_invites
      FOR DELETE
      TO authenticated
      USING (public.is_studio_admin(studio_id));
  END IF;
END $$;
