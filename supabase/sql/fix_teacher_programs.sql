-- Fix teacher_programs table with correct structure and RLS policies

-- Drop existing table if it exists
DROP TABLE IF EXISTS public.teacher_programs CASCADE;

-- Create teacher_programs table with correct structure
CREATE TABLE public.teacher_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(teacher_id, program_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_teacher_programs_teacher ON public.teacher_programs(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_programs_program ON public.teacher_programs(program_id);
CREATE INDEX IF NOT EXISTS idx_teacher_programs_studio ON public.teacher_programs(studio_id);

-- Enable Row Level Security
ALTER TABLE public.teacher_programs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "teacher_programs_studio_admin_select" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_studio_admin_insert" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_studio_admin_update" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_studio_admin_delete" ON public.teacher_programs;
DROP POLICY IF EXISTS "teacher_programs_teacher_select" ON public.teacher_programs;

-- RLS Policies for teacher_programs

-- Studio admins can view teacher assignments for their studio
CREATE POLICY "teacher_programs_studio_admin_select"
  ON public.teacher_programs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = teacher_programs.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = teacher_programs.studio_id
        AND studios.eigenaar_id = auth.uid()
    )
  );

-- Studio admins can create teacher assignments for their studio
CREATE POLICY "teacher_programs_studio_admin_insert"
  ON public.teacher_programs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = teacher_programs.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = teacher_programs.studio_id
        AND studios.eigenaar_id = auth.uid()
    )
  );

-- Studio admins can update teacher assignments for their studio
CREATE POLICY "teacher_programs_studio_admin_update"
  ON public.teacher_programs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = teacher_programs.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = teacher_programs.studio_id
        AND studios.eigenaar_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = teacher_programs.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = teacher_programs.studio_id
        AND studios.eigenaar_id = auth.uid()
    )
  );

-- Studio admins can delete teacher assignments for their studio
CREATE POLICY "teacher_programs_studio_admin_delete"
  ON public.teacher_programs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = teacher_programs.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = teacher_programs.studio_id
        AND studios.eigenaar_id = auth.uid()
    )
  );

-- Teachers can view their own program assignments
CREATE POLICY "teacher_programs_teacher_select"
  ON public.teacher_programs
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

-- Add comments for documentation
COMMENT ON TABLE public.teacher_programs IS 'Junction table linking teachers to programs they teach';
COMMENT ON COLUMN public.teacher_programs.teacher_id IS 'Reference to the teacher (auth.users.id)';
COMMENT ON COLUMN public.teacher_programs.program_id IS 'Reference to the program';
COMMENT ON COLUMN public.teacher_programs.studio_id IS 'Reference to the studio (for RLS and organization)';
COMMENT ON COLUMN public.teacher_programs.assigned_by IS 'Admin who made the assignment';
