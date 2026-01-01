-- Migration 039: Fix Teacher Policies - Add TO authenticated clause
-- Teacher policies were missing TO authenticated, causing 400 errors

-- Fix timesheets teacher policy
DROP POLICY IF EXISTS timesheets_teacher_view ON public.timesheets;
CREATE POLICY timesheets_teacher_view ON public.timesheets
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

-- Fix timesheet_entries teacher policy
DROP POLICY IF EXISTS timesheet_entries_teacher_view ON public.timesheet_entries;
CREATE POLICY timesheet_entries_teacher_view ON public.timesheet_entries
  FOR SELECT
  TO authenticated
  USING (
    timesheet_id IN (
      SELECT id FROM public.timesheets
      WHERE teacher_id = auth.uid()
    )
  );

-- Fix payrolls teacher policy
DROP POLICY IF EXISTS payrolls_teacher_view ON public.payrolls;
CREATE POLICY payrolls_teacher_view ON public.payrolls
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

-- Fix teacher_compensation teacher policy
DROP POLICY IF EXISTS teacher_compensation_teacher_view ON public.teacher_compensation;
CREATE POLICY teacher_compensation_teacher_view ON public.teacher_compensation
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

-- Fix timesheet_comments teacher policies
DROP POLICY IF EXISTS timesheet_comments_teacher_view ON public.timesheet_comments;
CREATE POLICY timesheet_comments_teacher_view ON public.timesheet_comments
  FOR SELECT
  TO authenticated
  USING (
    timesheet_id IN (
      SELECT id FROM public.timesheets
      WHERE teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS timesheet_comments_teacher_insert ON public.timesheet_comments;
CREATE POLICY timesheet_comments_teacher_insert ON public.timesheet_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    timesheet_id IN (
      SELECT id FROM public.timesheets
      WHERE teacher_id = auth.uid()
    )
  );
