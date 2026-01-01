-- 085_add_enrollment_id_to_lesson_attendances.sql
-- Add enrollment_id to lesson_attendances so attendance can be tracked per enrollment/sub-profile.

ALTER TABLE IF EXISTS public.lesson_attendances
  ADD COLUMN IF NOT EXISTS enrollment_id uuid NULL REFERENCES public.inschrijvingen(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_lesson_attendances_enrollment_id ON lesson_attendances(enrollment_id);

-- Create unique indexes to support UPSERT ON CONFLICT targets:
-- - lesson_id + enrollment_id (for per-enrollment attendance)
-- - lesson_id + user_id (legacy behavior / parent-account rows)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_attendances_lesson_enrollment ON lesson_attendances(lesson_id, enrollment_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_attendances_lesson_user ON lesson_attendances(lesson_id, user_id);

-- Update RLS policies to allow selecting/inserting/updating/deleting one's own attendance either by user_id or by enrollment ownership.
-- Note: review these policies in your environment before applying; they are additive to existing teacher/studio policies.

DROP POLICY IF EXISTS lesson_attendances_insert_own ON public.lesson_attendances;
CREATE POLICY lesson_attendances_insert_own ON public.lesson_attendances
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR (
      enrollment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.inschrijvingen i WHERE i.id = enrollment_id AND i.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS lesson_attendances_select_own ON public.lesson_attendances;
CREATE POLICY lesson_attendances_select_own ON public.lesson_attendances
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      enrollment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.inschrijvingen i WHERE i.id = enrollment_id AND i.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS lesson_attendances_update_own ON public.lesson_attendances;
CREATE POLICY lesson_attendances_update_own ON public.lesson_attendances
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (
      enrollment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.inschrijvingen i WHERE i.id = enrollment_id AND i.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      enrollment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.inschrijvingen i WHERE i.id = enrollment_id AND i.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS lesson_attendances_delete_own ON public.lesson_attendances;
CREATE POLICY lesson_attendances_delete_own ON public.lesson_attendances
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR (
      enrollment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.inschrijvingen i WHERE i.id = enrollment_id AND i.user_id = auth.uid()
      )
    )
  );

-- Teachers/studio_admin policies that reference lesson_attendances by lesson_id should continue to work.
