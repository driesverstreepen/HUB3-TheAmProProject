-- Migration: Add teacher role, teacher-program assignments, and attendance system
-- Created: 2025-10-31

-- 1. Update user_roles to support 'teacher' role
-- Note: user_roles table already exists, we just ensure teacher is a valid role
-- The CHECK constraint will be updated if needed via ALTER
DO $$ 
BEGIN
  -- Check if the constraint exists and update it
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'user_roles' AND constraint_name LIKE '%role_check%'
  ) THEN
    ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
  END IF;
  
  ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check 
    CHECK (role IN ('studio_admin', 'teacher', 'user', 'super_admin'));
END $$;

-- 2. Create teacher_programs junction table (many-to-many: teachers <-> programs)
CREATE TABLE IF NOT EXISTS public.teacher_programs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  assigned_at timestamp with time zone DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id), -- admin who assigned
  UNIQUE(teacher_id, program_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_teacher_programs_teacher ON public.teacher_programs(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_programs_program ON public.teacher_programs(program_id);
CREATE INDEX IF NOT EXISTS idx_teacher_programs_studio ON public.teacher_programs(studio_id);

-- 3. Add attendance feature toggle to studios table
ALTER TABLE public.studios 
ADD COLUMN IF NOT EXISTS attendance_enabled boolean DEFAULT false;

-- 4. Create lesson_attendances table for tracking attendance per lesson per user
CREATE TABLE IF NOT EXISTS public.lesson_attendances (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('present', 'absent', 'excused', 'late')) DEFAULT 'absent',
  marked_by uuid REFERENCES auth.users(id), -- teacher who marked attendance
  marked_at timestamp with time zone DEFAULT now(),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(lesson_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lesson_attendances_lesson ON public.lesson_attendances(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_attendances_user ON public.lesson_attendances(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_attendances_program ON public.lesson_attendances(program_id);

-- Comment tables for documentation
COMMENT ON TABLE public.teacher_programs IS 'Links teachers to programs they teach';
COMMENT ON TABLE public.lesson_attendances IS 'Tracks student attendance for each lesson';
COMMENT ON COLUMN public.studios.attendance_enabled IS 'Whether this studio uses the attendance tracking feature';
