-- Backfill existing lessons.teacher_id from teacher_programs
-- For each program, pick one assigned teacher (MIN by UUID) and set lessons.teacher_id
-- Only update lessons where teacher_id IS NULL to avoid overwriting manual assignments.

BEGIN;

-- Make sure the lessons.teacher_id column exists; migration 073 should've added it.
-- Update lessons for which we have a teacher assigned to the program.
UPDATE public.lessons l
SET teacher_id = sub.teacher_id
FROM (
  SELECT program_id, MIN(teacher_id::text)::uuid AS teacher_id
  FROM public.teacher_programs
  WHERE teacher_id IS NOT NULL
  GROUP BY program_id
) sub
WHERE l.program_id = sub.program_id
  AND l.teacher_id IS NULL;

COMMIT;

-- Notes:
-- - If a program has multiple teachers, this picks the MIN UUID (stable but arbitrary).
-- - We only backfill where lessons.teacher_id is NULL to avoid overwriting any existing specific lesson assignments.
-- - If you prefer a different selection rule (e.g. latest assigned), we can change the subquery accordingly.
