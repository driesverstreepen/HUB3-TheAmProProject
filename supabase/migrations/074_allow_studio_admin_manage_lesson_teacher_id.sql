-- Allow studio_admin users to SELECT and UPDATE lessons (including teacher_id) for programs in their studio.
-- This policy ensures studio_admins can read lesson rows and update them (including teacher_id) for lessons belonging to programs of their studio.

-- Drop existing policies if present (safe to re-create)
DROP POLICY IF EXISTS "Studio admins can view their studio's lessons" ON public.lessons;
DROP POLICY IF EXISTS "Studio admins can update their studio's lessons" ON public.lessons;

CREATE POLICY "Studio admins can view their studio's lessons"
  ON public.lessons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      JOIN public.user_roles ON user_roles.studio_id = programs.studio_id
      WHERE programs.id = lessons.program_id
        AND user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
    )
  );

CREATE POLICY "Studio admins can update their studio's lessons"
  ON public.lessons
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      JOIN public.user_roles ON user_roles.studio_id = programs.studio_id
      WHERE programs.id = lessons.program_id
        AND user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
    )
  )
  WITH CHECK (
    -- only allow updates when the same studio_admin condition holds (prevents elevating rows into other studios)
    EXISTS (
      SELECT 1 FROM public.programs
      JOIN public.user_roles ON user_roles.studio_id = programs.studio_id
      WHERE programs.id = lessons.program_id
        AND user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
    )
  );

-- Note: this policy allows studio_admins to update any updatable columns on lessons (including teacher_id).
