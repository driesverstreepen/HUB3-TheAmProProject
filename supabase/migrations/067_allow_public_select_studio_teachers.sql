-- Migration: Allow public SELECT on studio_teachers
-- studio_teachers links teacher user_ids to studios. Make it visible publicly so teacher lists can be shown.

BEGIN;

DROP POLICY IF EXISTS studio_teachers_view_own ON public.studio_teachers;
DROP POLICY IF EXISTS studio_teachers_admin_manage ON public.studio_teachers;
DROP POLICY IF EXISTS studio_teachers_service_role ON public.studio_teachers;

CREATE POLICY "Public can view studio teachers"
  ON public.studio_teachers
  FOR SELECT
  USING (true);

COMMIT;
