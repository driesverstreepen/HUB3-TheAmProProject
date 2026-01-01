-- Add RLS policy to allow teachers to read enrollments for their assigned programs

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Teachers can read enrollments for their programs" ON public.inschrijvingen;

-- Create policy for teachers to read enrollments
CREATE POLICY "Teachers can read enrollments for their programs"
ON public.inschrijvingen
FOR SELECT
USING (
  -- Allow if user is a teacher assigned to this program
  EXISTS (
    SELECT 1 
    FROM public.teacher_programs 
    WHERE teacher_programs.program_id = inschrijvingen.program_id 
    AND teacher_programs.teacher_id = auth.uid()
  )
  OR
  -- Allow if user is studio admin for the studio
  EXISTS (
    SELECT 1 
    FROM public.programs
    JOIN public.user_roles ON user_roles.studio_id = programs.studio_id
    WHERE programs.id = inschrijvingen.program_id
    AND user_roles.user_id = auth.uid()
    AND user_roles.role = 'studio_admin'
  )
  OR
  -- Allow if user is the owner of the enrollment
  inschrijvingen.user_id = auth.uid()
);

-- Verify the policy was created
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual
FROM pg_policies 
WHERE tablename = 'inschrijvingen' 
ORDER BY policyname;
