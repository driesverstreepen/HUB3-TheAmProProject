-- Test if auth.uid() works in RLS policies
-- This creates a simple test to verify authentication context

-- Temporarily disable RLS on teacher_programs to test
ALTER TABLE public.teacher_programs DISABLE ROW LEVEL SECURITY;

-- Re-enable it
ALTER TABLE public.teacher_programs ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies and create ONE simple policy
DROP POLICY IF EXISTS "Teachers can read their program assignments" ON public.teacher_programs;
DROP POLICY IF EXISTS "Teachers can read their program links" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_studio_admin_select" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_studio_admin_insert" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_studio_admin_update" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_studio_admin_delete" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_teacher_select" ON public.teacher_programs;

-- Create ONE simple test policy
CREATE POLICY "test_teacher_programs_select"
ON public.teacher_programs
FOR SELECT
TO authenticated
USING (teacher_id = auth.uid());

-- Check if it was created
SELECT policyname, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'teacher_programs';
