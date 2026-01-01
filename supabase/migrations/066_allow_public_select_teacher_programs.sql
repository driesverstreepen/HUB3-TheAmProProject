-- Migration: Allow public SELECT on teacher_programs
-- This table is a simple junction table (teacher_id, program_id). It's non-sensitive and
-- needed to display which teachers are assigned to programs on public pages.

BEGIN;

DROP POLICY IF EXISTS teacher_programs_view_own ON public.teacher_programs;
DROP POLICY IF EXISTS teacher_programs_studio_admin_manage ON public.teacher_programs;

CREATE POLICY "Public can view teacher program assignments"
  ON public.teacher_programs
  FOR SELECT
  USING (true);

COMMIT;
