-- 084_add_enrollment_id_to_lesson_absences.sql
-- Add enrollment_id to lesson_absences so absences can be tracked per enrollment/sub-profile.

ALTER TABLE IF EXISTS public.lesson_absences
  ADD COLUMN IF NOT EXISTS enrollment_id uuid NULL REFERENCES public.inschrijvingen(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_lesson_absences_enrollment_id ON lesson_absences(enrollment_id);

-- Update RLS policies to allow inserting/selecting one's own absences either by user_id or by enrollment ownership.
-- Note: these policies are additive; review in your environment before applying.

DROP POLICY IF EXISTS lesson_absences_insert_own ON public.lesson_absences;
CREATE POLICY lesson_absences_insert_own ON public.lesson_absences
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR (
      enrollment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.inschrijvingen i WHERE i.id = enrollment_id AND i.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS lesson_absences_select_own ON public.lesson_absences;
CREATE POLICY lesson_absences_select_own ON public.lesson_absences
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      enrollment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.inschrijvingen i WHERE i.id = enrollment_id AND i.user_id = auth.uid()
      )
    )
  );

-- Teachers and studio_admin policies that reference lesson_absences by lesson_id remain valid and do not need enrollment changes.
-- If you already have teacher/studio policies, they will continue to allow access for roles that were previously permitted.
