-- Migration 105: Studio role permissions (per-page access)
-- Creates the role-permissions table, helper function, seed defaults, and updates RLS policies.
-- NOTE: Migration 104 must run first (it commits new enum values).

-- 1) Per-studio permissions per role
CREATE TABLE IF NOT EXISTS public.studio_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  role studio_member_role NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(studio_id, role)
);

CREATE INDEX IF NOT EXISTS idx_studio_role_permissions_studio_id ON public.studio_role_permissions(studio_id);

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS trg_studio_role_permissions_updated_at ON public.studio_role_permissions;
CREATE TRIGGER trg_studio_role_permissions_updated_at
BEFORE UPDATE ON public.studio_role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.studio_role_permissions ENABLE ROW LEVEL SECURITY;

-- Allow studio members to read role permissions for their studio
DROP POLICY IF EXISTS studio_role_permissions_select_members ON public.studio_role_permissions;
CREATE POLICY studio_role_permissions_select_members
  ON public.studio_role_permissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.studio_members sm
      WHERE sm.studio_id = studio_role_permissions.studio_id
        AND sm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = studio_role_permissions.studio_id
        AND s.eigenaar_id = auth.uid()
    )
  );

-- Only studio owners can change role permissions
DROP POLICY IF EXISTS studio_role_permissions_write_owner ON public.studio_role_permissions;
CREATE POLICY studio_role_permissions_write_owner
  ON public.studio_role_permissions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = studio_role_permissions.studio_id
        AND s.eigenaar_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = studio_role_permissions.studio_id
        AND s.eigenaar_id = auth.uid()
    )
  );

-- 2) Permission check helper
-- Owners always have access. Other members are checked via studio_role_permissions.
CREATE OR REPLACE FUNCTION public.has_studio_permission(target_studio_id uuid, permission_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_role studio_member_role;
  perms jsonb;
  allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Studio owner always allowed
  IF EXISTS (
    SELECT 1 FROM public.studios s
    WHERE s.id = target_studio_id AND s.eigenaar_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  SELECT sm.role
  INTO member_role
  FROM public.studio_members sm
  WHERE sm.studio_id = target_studio_id
    AND sm.user_id = auth.uid()
  LIMIT 1;

  IF member_role IS NULL THEN
    RETURN false;
  END IF;

  IF member_role = 'owner' THEN
    RETURN true;
  END IF;

  SELECT srp.permissions
  INTO perms
  FROM public.studio_role_permissions srp
  WHERE srp.studio_id = target_studio_id
    AND srp.role = member_role
  LIMIT 1;

  IF perms IS NULL THEN
    RETURN false;
  END IF;

  allowed := COALESCE((perms ->> permission_key)::boolean, false);
  RETURN allowed;
END;
$$;

-- 3) Seed default permissions for existing studios
-- Keys align with sidebar featureKey values.
INSERT INTO public.studio_role_permissions (studio_id, role, permissions)
SELECT s.id, 'admin'::studio_member_role,
  jsonb_build_object(
    'studio.dashboard', true,
    'studio.programs', true,
    'studio.lessons', true,
    'studio.attendance', true,
    'studio.replacements', true,
    'studio.class-passes', true,
    'studio.members', true,
    'studio.evaluations', true,
    'studio.notes', true,
    'studio.emails', true,
    'studio.finance', true,
    'studio.settings', true,
    'studio.profile', true,
    'studio.public-profile', true
  )
FROM public.studios s
ON CONFLICT (studio_id, role) DO NOTHING;

INSERT INTO public.studio_role_permissions (studio_id, role, permissions)
SELECT s.id, 'bookkeeper'::studio_member_role,
  jsonb_build_object(
    'studio.dashboard', true,
    'studio.finance', true
  )
FROM public.studios s
ON CONFLICT (studio_id, role) DO NOTHING;

INSERT INTO public.studio_role_permissions (studio_id, role, permissions)
SELECT s.id, 'comms'::studio_member_role,
  jsonb_build_object(
    'studio.dashboard', true,
    'studio.programs', true,
    'studio.lessons', true,
    'studio.attendance', true,
    'studio.replacements', true,
    'studio.class-passes', true,
    'studio.notes', true,
    'studio.emails', true
  )
FROM public.studios s
ON CONFLICT (studio_id, role) DO NOTHING;

INSERT INTO public.studio_role_permissions (studio_id, role, permissions)
SELECT s.id, 'viewer'::studio_member_role,
  jsonb_build_object(
    'studio.dashboard', true
  )
FROM public.studios s
ON CONFLICT (studio_id, role) DO NOTHING;

-- 4) Update RLS for key studio tables to use permissions

-- Programs
DO $$
BEGIN
  IF to_regclass('public.programs') IS NOT NULL THEN
    DROP POLICY IF EXISTS programs_select_studio_admins ON public.programs;
    DROP POLICY IF EXISTS programs_insert_studio_admins ON public.programs;
    DROP POLICY IF EXISTS programs_update_studio_admins ON public.programs;
    DROP POLICY IF EXISTS programs_delete_studio_admins ON public.programs;

    CREATE POLICY programs_select_studio_permission
      ON public.programs
      FOR SELECT
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.programs'));

    CREATE POLICY programs_insert_studio_permission
      ON public.programs
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_studio_permission(studio_id, 'studio.programs'));

    CREATE POLICY programs_update_studio_permission
      ON public.programs
      FOR UPDATE
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.programs'))
      WITH CHECK (public.has_studio_permission(studio_id, 'studio.programs'));

    CREATE POLICY programs_delete_studio_permission
      ON public.programs
      FOR DELETE
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.programs'));
  END IF;
END $$;

-- Lessons (via programs.studio_id)
DO $$
BEGIN
  IF to_regclass('public.lessons') IS NOT NULL AND to_regclass('public.programs') IS NOT NULL THEN
    DROP POLICY IF EXISTS lessons_select_studio_admins ON public.lessons;
    DROP POLICY IF EXISTS lessons_insert_studio_admins ON public.lessons;
    DROP POLICY IF EXISTS lessons_update_studio_admins ON public.lessons;
    DROP POLICY IF EXISTS lessons_delete_studio_admins ON public.lessons;

    CREATE POLICY lessons_select_studio_permission
      ON public.lessons
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = public.lessons.program_id
            AND public.has_studio_permission(p.studio_id, 'studio.lessons')
        )
      );

    CREATE POLICY lessons_insert_studio_permission
      ON public.lessons
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = public.lessons.program_id
            AND public.has_studio_permission(p.studio_id, 'studio.lessons')
        )
      );

    CREATE POLICY lessons_update_studio_permission
      ON public.lessons
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = public.lessons.program_id
            AND public.has_studio_permission(p.studio_id, 'studio.lessons')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = public.lessons.program_id
            AND public.has_studio_permission(p.studio_id, 'studio.lessons')
        )
      );

    CREATE POLICY lessons_delete_studio_permission
      ON public.lessons
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = public.lessons.program_id
            AND public.has_studio_permission(p.studio_id, 'studio.lessons')
        )
      );
  END IF;
END $$;

-- Studio notes
DO $$
BEGIN
  IF to_regclass('public.studio_notes') IS NOT NULL THEN
    DROP POLICY IF EXISTS studio_notes_studio_member_select ON public.studio_notes;
    DROP POLICY IF EXISTS studio_notes_studio_member_insert ON public.studio_notes;
    DROP POLICY IF EXISTS studio_notes_studio_member_update ON public.studio_notes;
    DROP POLICY IF EXISTS studio_notes_studio_member_delete ON public.studio_notes;

    CREATE POLICY studio_notes_select_permission
      ON public.studio_notes
      FOR SELECT
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.notes'));

    CREATE POLICY studio_notes_insert_permission
      ON public.studio_notes
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_studio_permission(studio_id, 'studio.notes'));

    CREATE POLICY studio_notes_update_permission
      ON public.studio_notes
      FOR UPDATE
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.notes'))
      WITH CHECK (public.has_studio_permission(studio_id, 'studio.notes'));

    CREATE POLICY studio_notes_delete_permission
      ON public.studio_notes
      FOR DELETE
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.notes'));
  END IF;
END $$;

-- Studio emails
DO $$
BEGIN
  IF to_regclass('public.studio_emails') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Studio admins manage emails" ON public.studio_emails;

    CREATE POLICY studio_emails_all_permission
      ON public.studio_emails
      FOR ALL
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.emails'))
      WITH CHECK (public.has_studio_permission(studio_id, 'studio.emails'));
  END IF;
END $$;

-- Finance tables (timesheets/payrolls/teacher_compensation/timesheet_entries)
DO $$
BEGIN
  IF to_regclass('public.teacher_compensation') IS NOT NULL THEN
    DROP POLICY IF EXISTS teacher_compensation_admin_all ON public.teacher_compensation;
    DROP POLICY IF EXISTS teacher_compensation_admin_select ON public.teacher_compensation;
    DROP POLICY IF EXISTS teacher_compensation_admin_insert ON public.teacher_compensation;
    DROP POLICY IF EXISTS teacher_compensation_admin_update ON public.teacher_compensation;
    DROP POLICY IF EXISTS teacher_compensation_admin_delete ON public.teacher_compensation;

    CREATE POLICY teacher_compensation_select_finance
      ON public.teacher_compensation
      FOR SELECT
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.finance') OR teacher_id = auth.uid());

    CREATE POLICY teacher_compensation_write_finance
      ON public.teacher_compensation
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_studio_permission(studio_id, 'studio.finance'));

    CREATE POLICY teacher_compensation_update_finance
      ON public.teacher_compensation
      FOR UPDATE
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.finance'))
      WITH CHECK (public.has_studio_permission(studio_id, 'studio.finance'));

    CREATE POLICY teacher_compensation_delete_finance
      ON public.teacher_compensation
      FOR DELETE
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.finance'));
  END IF;

  IF to_regclass('public.timesheets') IS NOT NULL THEN
    DROP POLICY IF EXISTS timesheets_admin_all ON public.timesheets;

    CREATE POLICY timesheets_select_finance
      ON public.timesheets
      FOR SELECT
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.finance') OR teacher_id = auth.uid());

    CREATE POLICY timesheets_insert_finance
      ON public.timesheets
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_studio_permission(studio_id, 'studio.finance'));

    CREATE POLICY timesheets_update_finance
      ON public.timesheets
      FOR UPDATE
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.finance'))
      WITH CHECK (public.has_studio_permission(studio_id, 'studio.finance'));

    CREATE POLICY timesheets_delete_finance
      ON public.timesheets
      FOR DELETE
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.finance'));
  END IF;

  IF to_regclass('public.timesheet_entries') IS NOT NULL AND to_regclass('public.timesheets') IS NOT NULL THEN
    DROP POLICY IF EXISTS timesheet_entries_admin_all ON public.timesheet_entries;

    CREATE POLICY timesheet_entries_select_finance
      ON public.timesheet_entries
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.timesheets t
          WHERE t.id = timesheet_entries.timesheet_id
            AND (public.has_studio_permission(t.studio_id, 'studio.finance') OR t.teacher_id = auth.uid())
        )
      );

    CREATE POLICY timesheet_entries_write_finance
      ON public.timesheet_entries
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.timesheets t
          WHERE t.id = timesheet_entries.timesheet_id
            AND public.has_studio_permission(t.studio_id, 'studio.finance')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.timesheets t
          WHERE t.id = timesheet_entries.timesheet_id
            AND public.has_studio_permission(t.studio_id, 'studio.finance')
        )
      );
  END IF;

  IF to_regclass('public.payrolls') IS NOT NULL THEN
    DROP POLICY IF EXISTS payrolls_admin_all ON public.payrolls;

    CREATE POLICY payrolls_select_finance
      ON public.payrolls
      FOR SELECT
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.finance') OR teacher_id = auth.uid());

    CREATE POLICY payrolls_write_finance
      ON public.payrolls
      FOR ALL
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.finance'))
      WITH CHECK (public.has_studio_permission(studio_id, 'studio.finance'));
  END IF;
END $$;
