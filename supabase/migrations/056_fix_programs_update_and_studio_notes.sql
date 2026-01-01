-- Migration 056: Fix programs UPDATE policy and recreate studio_notes with correct references

-- =============================================================================
-- PART 1: Fix programs policies to include WITH CHECK and studio owner checks
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Studio admins can view their studio's programs" ON public.programs;
DROP POLICY IF EXISTS "Studio admins can insert programs for their studio" ON public.programs;
DROP POLICY IF EXISTS "Studio admins can update their studio's programs" ON public.programs;
DROP POLICY IF EXISTS "Studio admins can delete their studio's programs" ON public.programs;

-- Recreate SELECT policy
CREATE POLICY "Studio admins can view their studio's programs"
  ON public.programs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = programs.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = programs.studio_id
      AND studios.eigenaar_id = auth.uid()
    )
  );

-- Recreate INSERT policy
CREATE POLICY "Studio admins can insert programs for their studio"
  ON public.programs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = programs.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = programs.studio_id
      AND studios.eigenaar_id = auth.uid()
    )
  );

-- Recreate UPDATE policy with both USING and WITH CHECK clauses
CREATE POLICY "Studio admins can update their studio's programs"
  ON public.programs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = programs.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = programs.studio_id
      AND studios.eigenaar_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = programs.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = programs.studio_id
      AND studios.eigenaar_id = auth.uid()
    )
  );

-- Recreate DELETE policy
CREATE POLICY "Studio admins can delete their studio's programs"
  ON public.programs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = programs.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = programs.studio_id
      AND studios.eigenaar_id = auth.uid()
    )
  );

-- =============================================================================
-- PART 2: Create studio_notes table with correct teacher reference
-- =============================================================================

-- Drop if exists (safe recreation)
DROP TABLE IF EXISTS public.studio_notes CASCADE;

-- Create studio_notes table
CREATE TABLE public.studio_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  visible_to_teacher_ids UUID[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_studio_notes_studio_id ON public.studio_notes(studio_id);
CREATE INDEX idx_studio_notes_created_at ON public.studio_notes(created_at DESC);
CREATE INDEX idx_studio_notes_visible_teachers ON public.studio_notes USING GIN(visible_to_teacher_ids);

-- Enable Row Level Security
ALTER TABLE public.studio_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Studio admins can view all notes for their studio
CREATE POLICY "studio_notes_studio_admin_select"
  ON public.studio_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = studio_notes.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = studio_notes.studio_id
        AND studios.eigenaar_id = auth.uid()
    )
  );

-- Policy: Studio admins can create notes for their studio
CREATE POLICY "studio_notes_studio_admin_insert"
  ON public.studio_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = studio_notes.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = studio_notes.studio_id
        AND studios.eigenaar_id = auth.uid()
    )
  );

-- Policy: Studio admins can update their studio's notes
CREATE POLICY "studio_notes_studio_admin_update"
  ON public.studio_notes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = studio_notes.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = studio_notes.studio_id
        AND studios.eigenaar_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = studio_notes.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = studio_notes.studio_id
        AND studios.eigenaar_id = auth.uid()
    )
  );

-- Policy: Studio admins can delete their studio's notes
CREATE POLICY "studio_notes_studio_admin_delete"
  ON public.studio_notes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = studio_notes.studio_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios
      WHERE studios.id = studio_notes.studio_id
        AND studios.eigenaar_id = auth.uid()
    )
  );

-- Policy: Teachers can view notes where they are in visible_to_teacher_ids
-- Updated to use studio_teachers junction table instead of old teachers table
CREATE POLICY "studio_notes_teacher_select"
  ON public.studio_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.studio_teachers
      WHERE studio_teachers.user_id = auth.uid()
        AND studio_teachers.studio_id = studio_notes.studio_id
        AND studio_teachers.user_id = ANY(studio_notes.visible_to_teacher_ids)
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_studio_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER studio_notes_updated_at_trigger
  BEFORE UPDATE ON public.studio_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_studio_notes_updated_at();

COMMENT ON TABLE public.studio_notes IS 'Notes created by studio admins visible to specific teachers';
COMMENT ON COLUMN public.studio_notes.visible_to_teacher_ids IS 'Array of teacher user_ids who can see this note';
