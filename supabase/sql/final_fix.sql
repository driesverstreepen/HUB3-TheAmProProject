-- FINAL FIX: Complete database structure correction

-- 1. Fix teacher_programs table
DROP TABLE IF EXISTS public.teacher_programs CASCADE;

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

-- Indexes
CREATE INDEX idx_teacher_programs_teacher ON public.teacher_programs(teacher_id);
CREATE INDEX idx_teacher_programs_program ON public.teacher_programs(program_id);
CREATE INDEX idx_teacher_programs_studio ON public.teacher_programs(studio_id);

-- Enable RLS
ALTER TABLE public.teacher_programs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "teacher_programs_studio_admin_select" ON public.teacher_programs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'studio_admin' AND user_roles.studio_id = teacher_programs.studio_id)
    OR EXISTS (SELECT 1 FROM public.studios WHERE studios.id = teacher_programs.studio_id AND studios.eigenaar_id = auth.uid())
  );

CREATE POLICY "teacher_programs_studio_admin_insert" ON public.teacher_programs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'studio_admin' AND user_roles.studio_id = teacher_programs.studio_id)
    OR EXISTS (SELECT 1 FROM public.studios WHERE studios.id = teacher_programs.studio_id AND studios.eigenaar_id = auth.uid())
  );

CREATE POLICY "teacher_programs_studio_admin_update" ON public.teacher_programs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'studio_admin' AND user_roles.studio_id = teacher_programs.studio_id)
    OR EXISTS (SELECT 1 FROM public.studios WHERE studios.id = teacher_programs.studio_id AND studios.eigenaar_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'studio_admin' AND user_roles.studio_id = teacher_programs.studio_id)
    OR EXISTS (SELECT 1 FROM public.studios WHERE studios.id = teacher_programs.studio_id AND studios.eigenaar_id = auth.uid())
  );

CREATE POLICY "teacher_programs_studio_admin_delete" ON public.teacher_programs
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'studio_admin' AND user_roles.studio_id = teacher_programs.studio_id)
    OR EXISTS (SELECT 1 FROM public.studios WHERE studios.id = teacher_programs.studio_id AND studios.eigenaar_id = auth.uid())
  );

CREATE POLICY "teacher_programs_teacher_select" ON public.teacher_programs
  FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());

-- 2. Ensure group_details and workshop_details tables exist
CREATE TABLE IF NOT EXISTS public.group_details (
  program_id UUID PRIMARY KEY REFERENCES public.programs(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  season_start DATE,
  season_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workshop_details (
  program_id UUID PRIMARY KEY REFERENCES public.programs(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Ensure program_locations table exists
CREATE TABLE IF NOT EXISTS public.program_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id)
);

-- 4. Test data - create a teacher assignment to verify it works
-- (Replace with actual IDs from your database)
-- INSERT INTO teacher_programs (teacher_id, program_id, studio_id, assigned_by) 
-- VALUES ('teacher-user-id', 'program-id', 'studio-id', 'admin-user-id');

SELECT 'Database structure fixed - teacher_programs table recreated with correct columns' as status;
