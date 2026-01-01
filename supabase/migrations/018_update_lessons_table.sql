-- Update lessons table to match new programs structure
-- This migration aligns lessons with the new programs/locations schema

-- Add location_id foreign key column
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

-- Rename Dutch columns to English for consistency
ALTER TABLE public.lessons RENAME COLUMN naam TO title;
ALTER TABLE public.lessons RENAME COLUMN beschrijving TO description;
ALTER TABLE public.lessons RENAME COLUMN datum TO date;
ALTER TABLE public.lessons RENAME COLUMN tijd TO time;
ALTER TABLE public.lessons RENAME COLUMN duur TO duration_minutes;

-- Drop old text-based location column (replaced by location_id FK)
ALTER TABLE public.lessons DROP COLUMN IF EXISTS locatie;

-- Add index for location lookups
CREATE INDEX IF NOT EXISTS idx_lessons_location_id ON public.lessons(location_id);
CREATE INDEX IF NOT EXISTS idx_lessons_date ON public.lessons(date);

-- Update RLS policies for lessons to work with new studio_admin via programs
DROP POLICY IF EXISTS "Public can view lessons" ON public.lessons;
DROP POLICY IF EXISTS "Studio admins can manage lessons" ON public.lessons;

-- Studio admins can view lessons for their studio's programs
CREATE POLICY "Studio admins can view their studio's lessons"
  ON public.lessons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      JOIN public.user_roles ON user_roles.studio_id = programs.studio_id
      WHERE programs.id = lessons.program_id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
    )
  );

-- Studio admins can manage (insert/update/delete) lessons for their studio's programs
CREATE POLICY "Studio admins can manage their studio's lessons"
  ON public.lessons
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      JOIN public.user_roles ON user_roles.studio_id = programs.studio_id
      WHERE programs.id = lessons.program_id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
    )
  );

-- Verify changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'lessons'
ORDER BY ordinal_position;
