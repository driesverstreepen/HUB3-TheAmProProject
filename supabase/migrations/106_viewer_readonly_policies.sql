-- Migration 106: Enforce viewer as read-only
-- Viewer role may be granted page access, but must never be able to INSERT/UPDATE/DELETE.

-- 1) Write-permission helper: same as has_studio_permission, but denies viewer for write operations.
CREATE OR REPLACE FUNCTION public.has_studio_permission_write(target_studio_id uuid, permission_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_role studio_member_role;
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

  -- Explicitly deny viewer for all writes.
  IF member_role = 'viewer' THEN
    RETURN false;
  END IF;

  -- Delegate to read permission for the remaining roles.
  RETURN public.has_studio_permission(target_studio_id, permission_key);
END;
$$;

-- 2) Update write policies to use has_studio_permission_write

-- Programs
DO $$
BEGIN
  IF to_regclass('public.programs') IS NOT NULL THEN
    DROP POLICY IF EXISTS programs_insert_studio_permission ON public.programs;
    DROP POLICY IF EXISTS programs_update_studio_permission ON public.programs;
    DROP POLICY IF EXISTS programs_delete_studio_permission ON public.programs;

    CREATE POLICY programs_insert_studio_permission
      ON public.programs
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_studio_permission_write(studio_id, 'studio.programs'));

    CREATE POLICY programs_update_studio_permission
      ON public.programs
      FOR UPDATE
      TO authenticated
      USING (public.has_studio_permission_write(studio_id, 'studio.programs'))
      WITH CHECK (public.has_studio_permission_write(studio_id, 'studio.programs'));

    CREATE POLICY programs_delete_studio_permission
      ON public.programs
      FOR DELETE
      TO authenticated
      USING (public.has_studio_permission_write(studio_id, 'studio.programs'));
  END IF;
END $$;

-- Lessons (via programs.studio_id)
DO $$
BEGIN
  IF to_regclass('public.lessons') IS NOT NULL AND to_regclass('public.programs') IS NOT NULL THEN
    DROP POLICY IF EXISTS lessons_insert_studio_permission ON public.lessons;
    DROP POLICY IF EXISTS lessons_update_studio_permission ON public.lessons;
    DROP POLICY IF EXISTS lessons_delete_studio_permission ON public.lessons;

    CREATE POLICY lessons_insert_studio_permission
      ON public.lessons
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = public.lessons.program_id
            AND public.has_studio_permission_write(p.studio_id, 'studio.lessons')
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
            AND public.has_studio_permission_write(p.studio_id, 'studio.lessons')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = public.lessons.program_id
            AND public.has_studio_permission_write(p.studio_id, 'studio.lessons')
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
            AND public.has_studio_permission_write(p.studio_id, 'studio.lessons')
        )
      );
  END IF;
END $$;

-- Studio notes
DO $$
BEGIN
  IF to_regclass('public.studio_notes') IS NOT NULL THEN
    DROP POLICY IF EXISTS studio_notes_insert_permission ON public.studio_notes;
    DROP POLICY IF EXISTS studio_notes_update_permission ON public.studio_notes;
    DROP POLICY IF EXISTS studio_notes_delete_permission ON public.studio_notes;

    CREATE POLICY studio_notes_insert_permission
      ON public.studio_notes
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_studio_permission_write(studio_id, 'studio.notes'));

    CREATE POLICY studio_notes_update_permission
      ON public.studio_notes
      FOR UPDATE
      TO authenticated
      USING (public.has_studio_permission_write(studio_id, 'studio.notes'))
      WITH CHECK (public.has_studio_permission_write(studio_id, 'studio.notes'));

    CREATE POLICY studio_notes_delete_permission
      ON public.studio_notes
      FOR DELETE
      TO authenticated
      USING (public.has_studio_permission_write(studio_id, 'studio.notes'));
  END IF;
END $$;

-- Studio emails
DO $$
BEGIN
  IF to_regclass('public.studio_emails') IS NOT NULL THEN
    DROP POLICY IF EXISTS studio_emails_all_permission ON public.studio_emails;
    DROP POLICY IF EXISTS studio_emails_select_permission ON public.studio_emails;
    DROP POLICY IF EXISTS studio_emails_write_permission ON public.studio_emails;
    DROP POLICY IF EXISTS studio_emails_update_permission ON public.studio_emails;
    DROP POLICY IF EXISTS studio_emails_delete_permission ON public.studio_emails;

    CREATE POLICY studio_emails_select_permission
      ON public.studio_emails
      FOR SELECT
      TO authenticated
      USING (public.has_studio_permission(studio_id, 'studio.emails'));

    CREATE POLICY studio_emails_write_permission
      ON public.studio_emails
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_studio_permission_write(studio_id, 'studio.emails'));

    CREATE POLICY studio_emails_update_permission
      ON public.studio_emails
      FOR UPDATE
      TO authenticated
      USING (public.has_studio_permission_write(studio_id, 'studio.emails'))
      WITH CHECK (public.has_studio_permission_write(studio_id, 'studio.emails'));

    CREATE POLICY studio_emails_delete_permission
      ON public.studio_emails
      FOR DELETE
      TO authenticated
      USING (public.has_studio_permission_write(studio_id, 'studio.emails'));
  END IF;
END $$;

-- Finance tables
DO $$
BEGIN
  IF to_regclass('public.teacher_compensation') IS NOT NULL THEN
    DROP POLICY IF EXISTS teacher_compensation_write_finance ON public.teacher_compensation;
    DROP POLICY IF EXISTS teacher_compensation_update_finance ON public.teacher_compensation;
    DROP POLICY IF EXISTS teacher_compensation_delete_finance ON public.teacher_compensation;

    CREATE POLICY teacher_compensation_write_finance
      ON public.teacher_compensation
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_studio_permission_write(studio_id, 'studio.finance'));

    CREATE POLICY teacher_compensation_update_finance
      ON public.teacher_compensation
      FOR UPDATE
      TO authenticated
      USING (public.has_studio_permission_write(studio_id, 'studio.finance'))
      WITH CHECK (public.has_studio_permission_write(studio_id, 'studio.finance'));

    CREATE POLICY teacher_compensation_delete_finance
      ON public.teacher_compensation
      FOR DELETE
      TO authenticated
      USING (public.has_studio_permission_write(studio_id, 'studio.finance'));
  END IF;

  IF to_regclass('public.timesheets') IS NOT NULL THEN
    DROP POLICY IF EXISTS timesheets_insert_finance ON public.timesheets;
    DROP POLICY IF EXISTS timesheets_update_finance ON public.timesheets;
    DROP POLICY IF EXISTS timesheets_delete_finance ON public.timesheets;

    CREATE POLICY timesheets_insert_finance
      ON public.timesheets
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_studio_permission_write(studio_id, 'studio.finance'));

    CREATE POLICY timesheets_update_finance
      ON public.timesheets
      FOR UPDATE
      TO authenticated
      USING (public.has_studio_permission_write(studio_id, 'studio.finance'))
      WITH CHECK (public.has_studio_permission_write(studio_id, 'studio.finance'));

    CREATE POLICY timesheets_delete_finance
      ON public.timesheets
      FOR DELETE
      TO authenticated
      USING (public.has_studio_permission_write(studio_id, 'studio.finance'));
  END IF;

  IF to_regclass('public.timesheet_entries') IS NOT NULL AND to_regclass('public.timesheets') IS NOT NULL THEN
    DROP POLICY IF EXISTS timesheet_entries_write_finance ON public.timesheet_entries;

    CREATE POLICY timesheet_entries_write_finance
      ON public.timesheet_entries
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.timesheets t
          WHERE t.id = timesheet_entries.timesheet_id
            AND public.has_studio_permission_write(t.studio_id, 'studio.finance')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.timesheets t
          WHERE t.id = timesheet_entries.timesheet_id
            AND public.has_studio_permission_write(t.studio_id, 'studio.finance')
        )
      );
  END IF;

  IF to_regclass('public.payrolls') IS NOT NULL THEN
    DROP POLICY IF EXISTS payrolls_write_finance ON public.payrolls;

    CREATE POLICY payrolls_write_finance
      ON public.payrolls
      FOR ALL
      TO authenticated
      USING (public.has_studio_permission_write(studio_id, 'studio.finance'))
      WITH CHECK (public.has_studio_permission_write(studio_id, 'studio.finance'));
  END IF;
END $$;
