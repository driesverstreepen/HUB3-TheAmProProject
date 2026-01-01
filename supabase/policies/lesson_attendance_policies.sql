-- Policies to allow teachers to manage attendance for lessons they teach.
-- Run these statements as a DB admin (psql or Supabase SQL editor).
-- They assume the following tables exist with these columns:
-- - public.lesson_attendances(lesson_id, user_id, program_id, ...)
-- - public.lessons(id, program_id)
-- - public.teacher_programs(teacher_id, program_id)
-- - public.lesson_absences(lesson_id, user_id, ...)
-- auth.uid() is used to refer to the current authenticated user's id.

-- IMPORTANT: adapt schema names if different in your DB. Test in a staging environment first.

-- 1) Allow teachers to SELECT/INSERT/UPDATE/DELETE attendance records for lessons belonging to programs they teach
ALTER TABLE IF EXISTS public.lesson_attendances ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if present then create (Postgres CREATE POLICY has no IF NOT EXISTS)
DROP POLICY IF EXISTS "Teachers manage lesson_attendances for programs they teach" ON public.lesson_attendances;
CREATE POLICY "Teachers manage lesson_attendances for programs they teach"
ON public.lesson_attendances
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.teacher_programs tp
    JOIN public.lessons l ON l.program_id = tp.program_id
    WHERE tp.teacher_id = auth.uid() AND l.id = lesson_attendances.lesson_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.teacher_programs tp
    JOIN public.lessons l ON l.program_id = tp.program_id
    WHERE tp.teacher_id = auth.uid() AND l.id = lesson_attendances.lesson_id
  )
);

-- 2) Allow teachers to SELECT lesson_absences for lessons they teach (useful to view user-reported absences)
ALTER TABLE IF EXISTS public.lesson_absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers select lesson_absences for programs they teach" ON public.lesson_absences;
CREATE POLICY "Teachers select lesson_absences for programs they teach"
ON public.lesson_absences
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.teacher_programs tp
    JOIN public.lessons l ON l.program_id = tp.program_id
    WHERE tp.teacher_id = auth.uid() AND l.id = lesson_absences.lesson_id
  )
);

-- Optionally allow teachers to insert/delete lesson_absences on behalf of students (if desired):
DROP POLICY IF EXISTS "Teachers insert/delete lesson_absences for programs they teach" ON public.lesson_absences;
CREATE POLICY "Teachers insert/delete lesson_absences for programs they teach"
ON public.lesson_absences
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.teacher_programs tp
    JOIN public.lessons l ON l.program_id = tp.program_id
    WHERE tp.teacher_id = auth.uid() AND l.id = lesson_absences.lesson_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.teacher_programs tp
    JOIN public.lessons l ON l.program_id = tp.program_id
    WHERE tp.teacher_id = auth.uid() AND l.id = lesson_absences.lesson_id
  )
);

-- Notes:
-- - If your DB already has RLS policies, review them first to avoid conflicts.
-- - These policies restrict teachers to managing attendance only for lessons in programs they are assigned to via teacher_programs.
-- - For server-side service-role use (like admin scripts), keep using the service_role key which bypasses RLS.
