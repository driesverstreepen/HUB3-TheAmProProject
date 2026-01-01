-- Migration 054: Create studio_notes table
-- Allows studio admins to create notes visible to specific teachers

DROP TABLE IF EXISTS public.studio_notes CASCADE;

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
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = studio_notes.studio_id
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
  );

-- Policy: Teachers can view notes where they are in visible_to_teacher_ids
CREATE POLICY "studio_notes_teacher_select"
  ON public.studio_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teachers
      WHERE teachers.user_id = auth.uid()
        AND teachers.id = ANY(studio_notes.visible_to_teacher_ids)
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
COMMENT ON COLUMN public.studio_notes.visible_to_teacher_ids IS 'Array of teacher IDs who can see this note';
