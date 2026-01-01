-- Enable RLS on inschrijvingen if not already enabled
ALTER TABLE public.inschrijvingen ENABLE ROW LEVEL SECURITY;

-- Enable RLS on program_locations if not already enabled  
ALTER TABLE public.program_locations ENABLE ROW LEVEL SECURITY;

-- Policy: Teachers can read enrollments for their assigned programs
CREATE POLICY "Teachers can read enrollments for their programs"
ON public.inschrijvingen
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.teacher_programs tp
    WHERE tp.program_id = inschrijvingen.program_id
    AND tp.teacher_id = auth.uid()
  )
);

-- Policy: Studio admins can read all enrollments for their studio's programs
CREATE POLICY "Studio admins can read enrollments for their studio"
ON public.inschrijvingen
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.programs p
    INNER JOIN public.user_roles ur ON ur.studio_id = p.studio_id
    WHERE p.id = inschrijvingen.program_id
    AND ur.user_id = auth.uid()
    AND ur.role = 'studio_admin'
  )
);

-- Policy: Users can read their own enrollments
CREATE POLICY "Users can read their own enrollments"
ON public.inschrijvingen
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Teachers can read program locations for their assigned programs
CREATE POLICY "Teachers can read program locations for their programs"
ON public.program_locations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.teacher_programs tp
    WHERE tp.program_id = program_locations.program_id
    AND tp.teacher_id = auth.uid()
  )
);

-- Policy: Studio admins can read program locations for their studio
CREATE POLICY "Studio admins can read program locations for their studio"
ON public.program_locations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.programs p
    INNER JOIN public.user_roles ur ON ur.studio_id = p.studio_id
    WHERE p.id = program_locations.program_id
    AND ur.user_id = auth.uid()
    AND ur.role = 'studio_admin'
  )
);

-- Policy: Anyone can read program locations for public programs
CREATE POLICY "Anyone can read program locations for public programs"
ON public.program_locations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = program_locations.program_id
    AND p.is_public = true
  )
);
