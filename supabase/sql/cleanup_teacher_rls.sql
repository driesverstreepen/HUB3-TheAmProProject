-- Cleanup and normalize RLS for teacher visibility
-- Drops conflicting/legacy policies and installs clean SELECT policies

-- Ensure RLS is enabled
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_programs ENABLE ROW LEVEL SECURITY;

-- LESSONS: drop legacy conflicting policies
DROP POLICY IF EXISTS "Iedereen kan lessen zien" ON public.lessons;
DROP POLICY IF EXISTS "Studio admins can update their studio's lessons" ON public.lessons;
DROP POLICY IF EXISTS "Studio admins can view their studio's lessons" ON public.lessons;
DROP POLICY IF EXISTS "Studio admins kunnen lessen van hun programma's beheren" ON public.lessons;
DROP POLICY IF EXISTS "Teachers can read their lessons" ON public.lessons;

-- LESSONS: allow teachers and studio admins to view
CREATE POLICY "lessons_teacher_select"
ON public.lessons
FOR SELECT
TO authenticated
USING (
  teacher_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.teacher_programs tp
    WHERE tp.program_id = lessons.program_id
      AND tp.teacher_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.programs p ON p.studio_id = ur.studio_id
    WHERE ur.user_id = auth.uid() AND ur.role = 'studio_admin' AND p.id = lessons.program_id
  )
);

-- PROGRAMS: drop conflicting
DROP POLICY IF EXISTS "Iedereen kan programma's zien" ON public.programs;
DROP POLICY IF EXISTS "Public can view public programs" ON public.programs;
DROP POLICY IF EXISTS "Studio admins can delete their studio's programs" ON public.programs;
DROP POLICY IF EXISTS "Studio admins can insert programs for their studio" ON public.programs;
DROP POLICY IF EXISTS "Studio admins can update their studio's programs" ON public.programs;
DROP POLICY IF EXISTS "Studio admins can view their studio's programs" ON public.programs;
DROP POLICY IF EXISTS "Studio admins kunnen programma's van hun studio beheren" ON public.programs;
DROP POLICY IF EXISTS "Teachers can read programs they teach" ON public.programs;

-- PROGRAMS: allow teachers and studio admins to view
CREATE POLICY "programs_teacher_admin_select"
ON public.programs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.teacher_programs tp
    WHERE tp.program_id = programs.id AND tp.teacher_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'studio_admin' AND ur.studio_id = programs.studio_id
  )
);

-- STUDIOS: drop conflicting overly broad policies
DROP POLICY IF EXISTS "Iedereen kan studios zien" ON public.studios;
DROP POLICY IF EXISTS "Studio admins can view their subscription info" ON public.studios;
DROP POLICY IF EXISTS "Studio admins kunnen hun studios updaten" ON public.studios;
DROP POLICY IF EXISTS "Studio admins kunnen studios aanmaken" ON public.studios;
DROP POLICY IF EXISTS "Users can insert their own studio" ON public.studios;
DROP POLICY IF EXISTS "Users can update their own studio" ON public.studios;
DROP POLICY IF EXISTS "Users can view their own studio" ON public.studios;
DROP POLICY IF EXISTS "studios_allow_insert_owner" ON public.studios;
DROP POLICY IF EXISTS "Teachers can read studios for their programs" ON public.studios;

-- STUDIOS: allow minimal read for teachers and studio admins
CREATE POLICY "studios_teacher_admin_select"
ON public.studios
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.programs p
    JOIN public.teacher_programs tp ON tp.program_id = p.id
    WHERE p.studio_id = studios.id AND tp.teacher_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'studio_admin' AND ur.studio_id = studios.id
  )
);

-- TEACHER_PROGRAMS: drop conflicting
DROP POLICY IF EXISTS "Teachers can read their program assignments" ON public.teacher_programs;
DROP POLICY IF EXISTS "Teachers can read their program links" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_studio_admin_delete" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_studio_admin_insert" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_studio_admin_select" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_studio_admin_update" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_teacher_select" ON public.teacher_programs;
DROP POLICY IF EXISTS "test_teacher_programs_select" ON public.teacher_programs;

-- TEACHER_PROGRAMS: allow teacher read, studio admin manage
CREATE POLICY "teacher_programs_teacher_select"
ON public.teacher_programs
FOR SELECT
TO authenticated
USING (teacher_id = auth.uid());

CREATE POLICY "teacher_programs_admin_all"
ON public.teacher_programs
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'studio_admin' AND ur.studio_id = teacher_programs.studio_id
  )
);

-- Verify
SELECT schemaname, tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('lessons','programs','studios','teacher_programs')
ORDER BY tablename, policyname;
