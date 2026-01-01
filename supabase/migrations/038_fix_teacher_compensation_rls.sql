-- Migration 038: Fix teacher_compensation RLS policies
-- This fixes the RLS policy issue preventing inserts/updates
-- The issue was that policies checked studio_admin_profiles, but auth uses user_roles

-- Disable RLS temporarily to clean up
ALTER TABLE public.teacher_compensation DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS teacher_compensation_admin_all ON public.teacher_compensation;
DROP POLICY IF EXISTS teacher_compensation_admin_select ON public.teacher_compensation;
DROP POLICY IF EXISTS teacher_compensation_admin_insert ON public.teacher_compensation;
DROP POLICY IF EXISTS teacher_compensation_admin_update ON public.teacher_compensation;
DROP POLICY IF EXISTS teacher_compensation_admin_delete ON public.teacher_compensation;
DROP POLICY IF EXISTS teacher_compensation_teacher_view ON public.teacher_compensation;

-- Re-enable RLS
ALTER TABLE public.teacher_compensation ENABLE ROW LEVEL SECURITY;

-- Create separate policies for each operation
-- IMPORTANT: Check user_roles table (not studio_admin_profiles) for studio_admin role

-- Studio admins can SELECT
CREATE POLICY teacher_compensation_admin_select ON public.teacher_compensation
  FOR SELECT
  TO authenticated
  USING (
    studio_id IN (
      SELECT studio_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  );

-- Studio admins can INSERT
CREATE POLICY teacher_compensation_admin_insert ON public.teacher_compensation
  FOR INSERT
  TO authenticated
  WITH CHECK (
    studio_id IN (
      SELECT studio_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  );

-- Studio admins can UPDATE
CREATE POLICY teacher_compensation_admin_update ON public.teacher_compensation
  FOR UPDATE
  TO authenticated
  USING (
    studio_id IN (
      SELECT studio_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  )
  WITH CHECK (
    studio_id IN (
      SELECT studio_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  );

-- Studio admins can DELETE
CREATE POLICY teacher_compensation_admin_delete ON public.teacher_compensation
  FOR DELETE
  TO authenticated
  USING (
    studio_id IN (
      SELECT studio_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  );

-- Teachers can view their own compensation settings
CREATE POLICY teacher_compensation_teacher_view ON public.teacher_compensation
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());
