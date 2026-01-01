-- Fix RLS policies for teacher access to lessons and programs
-- This allows teachers to read their assigned lessons and programs

-- First, ensure RLS is enabled on the tables
ALTER TABLE public.teacher_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- 1. Allow teachers to read their teacher_programs entries
DROP POLICY IF EXISTS "Teachers can read their program assignments" ON public.teacher_programs;
CREATE POLICY "Teachers can read their program assignments"
ON public.teacher_programs
FOR SELECT
TO authenticated
USING (teacher_id = auth.uid());

-- 2. Allow teachers to read programs they teach
DROP POLICY IF EXISTS "Teachers can read programs they teach" ON public.programs;
CREATE POLICY "Teachers can read programs they teach"
ON public.programs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.teacher_programs tp
    WHERE tp.program_id = programs.id
      AND tp.teacher_id = auth.uid()
  )
);

-- 3. Allow teachers to read studios for their programs
DROP POLICY IF EXISTS "Teachers can read studios for their programs" ON public.studios;
CREATE POLICY "Teachers can read studios for their programs"
ON public.studios
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.programs p
    INNER JOIN public.teacher_programs tp ON tp.program_id = p.id
    WHERE p.studio_id = studios.id
      AND tp.teacher_id = auth.uid()
  )
);

-- 4. Allow teachers to read their lessons
DROP POLICY IF EXISTS "Teachers can read their lessons" ON public.lessons;
CREATE POLICY "Teachers can read their lessons"
ON public.lessons
FOR SELECT
TO authenticated
USING (teacher_id = auth.uid());

-- Verify the policies were created
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename IN ('teacher_programs', 'programs', 'studios', 'lessons')
  AND policyname LIKE '%Teachers%'
ORDER BY tablename, policyname;
