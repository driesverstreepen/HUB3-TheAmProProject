-- Migration: Ensure group_details has appropriate SELECT policies
-- This migration makes sure that group_details rows are selectable when
-- (a) the program is public, or (b) the authenticated user is a studio_admin for the program's studio.

BEGIN;

-- Drop any old policies that may conflict
DROP POLICY IF EXISTS "Studio admins can manage group details" ON public.group_details;
DROP POLICY IF EXISTS "Public can view group details for public programs" ON public.group_details;
DROP POLICY IF EXISTS "Studio admins can view group details" ON public.group_details;

-- Policy: Studio admins can SELECT group_details for programs in their studio
CREATE POLICY "Studio admins can view group details"
  ON public.group_details
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      JOIN public.user_roles ON user_roles.studio_id = programs.studio_id
      WHERE programs.id = group_details.program_id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
    )
  );

-- Policy: Public (anon) can SELECT group_details for programs that are marked public
CREATE POLICY "Public can view group details for public programs"
  ON public.group_details
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      WHERE programs.id = group_details.program_id
      AND programs.is_public = true
    )
  );

COMMIT;

-- End migration
