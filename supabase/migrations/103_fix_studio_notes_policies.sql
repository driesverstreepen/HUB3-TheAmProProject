-- Migration 103: Fix studio_notes RLS to use studio_members roles (owner/admin)

-- The app uses studio_members (role: owner/admin) for studio access.
-- Older policies referenced legacy user_roles.role = 'studio_admin', which blocks newly-added admins.

ALTER TABLE public.studio_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "studio_notes_studio_admin_select" ON public.studio_notes;
DROP POLICY IF EXISTS "studio_notes_studio_admin_insert" ON public.studio_notes;
DROP POLICY IF EXISTS "studio_notes_studio_admin_update" ON public.studio_notes;
DROP POLICY IF EXISTS "studio_notes_studio_admin_delete" ON public.studio_notes;
DROP POLICY IF EXISTS "studio_notes_teacher_select" ON public.studio_notes;

-- Studio members (owner/admin) can view all notes for their studio
CREATE POLICY "studio_notes_studio_member_select"
  ON public.studio_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.studio_members sm
      WHERE sm.studio_id = studio_notes.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.studio_id = studio_notes.studio_id
        AND ur.role = 'studio_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = studio_notes.studio_id
        AND s.eigenaar_id = auth.uid()
    )
  );

-- Studio members (owner/admin) can create notes for their studio
CREATE POLICY "studio_notes_studio_member_insert"
  ON public.studio_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.studio_members sm
      WHERE sm.studio_id = studio_notes.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.studio_id = studio_notes.studio_id
        AND ur.role = 'studio_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = studio_notes.studio_id
        AND s.eigenaar_id = auth.uid()
    )
  );

-- Studio members (owner/admin) can update notes for their studio
CREATE POLICY "studio_notes_studio_member_update"
  ON public.studio_notes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.studio_members sm
      WHERE sm.studio_id = studio_notes.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.studio_id = studio_notes.studio_id
        AND ur.role = 'studio_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = studio_notes.studio_id
        AND s.eigenaar_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.studio_members sm
      WHERE sm.studio_id = studio_notes.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.studio_id = studio_notes.studio_id
        AND ur.role = 'studio_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = studio_notes.studio_id
        AND s.eigenaar_id = auth.uid()
    )
  );

-- Studio members (owner/admin) can delete notes for their studio
CREATE POLICY "studio_notes_studio_member_delete"
  ON public.studio_notes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.studio_members sm
      WHERE sm.studio_id = studio_notes.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.studio_id = studio_notes.studio_id
        AND ur.role = 'studio_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = studio_notes.studio_id
        AND s.eigenaar_id = auth.uid()
    )
  );

-- Teachers can view notes where they are in visible_to_teacher_ids
CREATE POLICY "studio_notes_teacher_select"
  ON public.studio_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.user_id = auth.uid()
        AND t.id = ANY(studio_notes.visible_to_teacher_ids)
    )
  );
