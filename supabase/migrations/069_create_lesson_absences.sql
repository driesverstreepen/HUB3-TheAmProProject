-- 069_create_lesson_absences.sql
-- Adds a table to track per-lesson absences reported by users.

CREATE TABLE IF NOT EXISTS lesson_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_absences_lesson_id ON lesson_absences(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_absences_user_id ON lesson_absences(user_id);

-- NOTE: Add RLS policies as needed per your studio access model.
-- Typical policies:
-- 1) allow authenticated users to insert their own absences
-- 2) allow users to select their own absences
-- 3) allow studio_admins/teachers to select absences for lessons in their studio
-- Example policies following project conventions.
-- These are enabled but you can comment them out if you want to apply policies later.

ALTER TABLE public.lesson_absences ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own absence records
DROP POLICY IF EXISTS lesson_absences_insert_own ON public.lesson_absences;
CREATE POLICY lesson_absences_insert_own ON public.lesson_absences
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Allow users to select their own absences
DROP POLICY IF EXISTS lesson_absences_select_own ON public.lesson_absences;
CREATE POLICY lesson_absences_select_own ON public.lesson_absences
  FOR SELECT
  USING (user_id = auth.uid());

-- Allow studio admins to view absences for lessons in their studio
DROP POLICY IF EXISTS lesson_absences_studio_admin_view ON public.lesson_absences;
CREATE POLICY lesson_absences_studio_admin_view ON public.lesson_absences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      JOIN public.lessons ON lessons.program_id = programs.id
      JOIN public.user_roles ON user_roles.studio_id = programs.studio_id
      WHERE lessons.id = lesson_absences.lesson_id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
    )
  );

-- Allow teachers assigned to the program to view absences for their lessons
DROP POLICY IF EXISTS lesson_absences_teacher_view ON public.lesson_absences;
CREATE POLICY lesson_absences_teacher_view ON public.lesson_absences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teacher_programs
      JOIN public.lessons ON lessons.program_id = teacher_programs.program_id
      WHERE lessons.id = lesson_absences.lesson_id
      AND teacher_programs.teacher_id = auth.uid()
    )
  );

-- Apply RLS policies after reviewing them; adjust roles/joins if your user_roles/teacher_programs schema differs.
