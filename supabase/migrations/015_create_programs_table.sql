-- Create programs table for courses and workshops
CREATE TABLE IF NOT EXISTS public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  program_type TEXT NOT NULL CHECK (program_type IN ('group', 'workshop')),
  title TEXT NOT NULL,
  description TEXT,
  dance_style TEXT,
  level TEXT CHECK (level IN ('beginner', 'intermediate', 'advanced', 'all_levels')),
  capacity INTEGER,
  price DECIMAL(10, 2),
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create group_details table for recurring group programs
CREATE TABLE IF NOT EXISTS public.group_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  season_start DATE,
  season_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create workshop_details table for one-time workshops
CREATE TABLE IF NOT EXISTS public.workshop_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create program_locations junction table
CREATE TABLE IF NOT EXISTS public.program_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, location_id)
);

-- Enable RLS on all tables
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for programs
CREATE POLICY "Studio admins can view their studio's programs"
  ON public.programs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = programs.studio_id
    )
  );

CREATE POLICY "Studio admins can insert programs for their studio"
  ON public.programs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = programs.studio_id
    )
  );

CREATE POLICY "Studio admins can update their studio's programs"
  ON public.programs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = programs.studio_id
    )
  );

CREATE POLICY "Studio admins can delete their studio's programs"
  ON public.programs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = programs.studio_id
    )
  );

-- RLS Policies for group_details
CREATE POLICY "Studio admins can manage group details"
  ON public.group_details
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      JOIN public.user_roles ON user_roles.studio_id = programs.studio_id
      WHERE programs.id = group_details.program_id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
    )
  );

-- RLS Policies for workshop_details
CREATE POLICY "Studio admins can manage workshop details"
  ON public.workshop_details
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      JOIN public.user_roles ON user_roles.studio_id = programs.studio_id
      WHERE programs.id = workshop_details.program_id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
    )
  );

-- RLS Policies for program_locations
CREATE POLICY "Studio admins can manage program locations"
  ON public.program_locations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      JOIN public.user_roles ON user_roles.studio_id = programs.studio_id
      WHERE programs.id = program_locations.program_id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_programs_studio_id ON public.programs(studio_id);
CREATE INDEX IF NOT EXISTS idx_group_details_program_id ON public.group_details(program_id);
CREATE INDEX IF NOT EXISTS idx_workshop_details_program_id ON public.workshop_details(program_id);
CREATE INDEX IF NOT EXISTS idx_program_locations_program_id ON public.program_locations(program_id);
CREATE INDEX IF NOT EXISTS idx_program_locations_location_id ON public.program_locations(location_id);
