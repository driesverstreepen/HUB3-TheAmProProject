-- 086_fix_lesson_attendances_uniqueness.sql
-- Allow tracking attendance per enrollment/sub-profile.
--
-- Previously we enforced UNIQUE(lesson_id, user_id) on lesson_attendances.
-- This breaks subprofiles because multiple enrollments can share the same parent user_id.
--
-- New rule:
-- - Attendance is uniquely identified by (lesson_id, enrollment_id)
-- - user_id remains for ownership/auditing and joins, but is not unique per lesson.

-- Drop legacy unique constraint + redundant unique index (if present)
ALTER TABLE IF EXISTS public.lesson_attendances
  DROP CONSTRAINT IF EXISTS lesson_attendances_lesson_id_user_id_key;

DROP INDEX IF EXISTS public.uq_lesson_attendances_lesson_user;

-- Best-effort backfill: assign enrollment_id to legacy rows that predate enrollment_id
-- by picking an enrollment for the same (program_id, user_id).
-- Use a correlated subquery (works reliably in UPDATE context).
UPDATE public.lesson_attendances la
SET enrollment_id = (
  SELECT i.id
  FROM public.inschrijvingen i
  WHERE i.program_id = la.program_id
    AND i.user_id = la.user_id
  ORDER BY (i.sub_profile_id IS NULL) DESC, i.id ASC
  LIMIT 1
)
WHERE la.enrollment_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.inschrijvingen i
    WHERE i.program_id = la.program_id
      AND i.user_id = la.user_id
  );

-- Ensure we have the correct unique index for UPSERT
CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_attendances_lesson_enrollment
  ON public.lesson_attendances(lesson_id, enrollment_id);

-- Optional helper index for lookups
CREATE INDEX IF NOT EXISTS idx_lesson_attendances_lesson_user
  ON public.lesson_attendances(lesson_id, user_id);
