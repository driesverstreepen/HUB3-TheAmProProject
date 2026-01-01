-- Migration 110: Add school_year_id to remaining studio-scoped tables
-- Adds school_year_id columns and backfills from existing relations.
-- Idempotent: safe to run multiple times.

-- 1) lesson_attendances.school_year_id (derive from lessons/programs)
ALTER TABLE public.lesson_attendances
  ADD COLUMN IF NOT EXISTS school_year_id uuid;

UPDATE public.lesson_attendances la
SET school_year_id = l.school_year_id
FROM public.lessons l
WHERE la.school_year_id IS NULL
  AND la.lesson_id = l.id
  AND l.school_year_id IS NOT NULL;

UPDATE public.lesson_attendances la
SET school_year_id = p.school_year_id
FROM public.programs p
WHERE la.school_year_id IS NULL
  AND la.program_id = p.id
  AND p.school_year_id IS NOT NULL;

-- Last resort: use the studio's active year
UPDATE public.lesson_attendances la
SET school_year_id = sy.id
FROM public.programs p
JOIN public.studio_school_years sy
  ON sy.studio_id = p.studio_id
 AND sy.is_active = true
WHERE la.school_year_id IS NULL
  AND la.program_id = p.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lesson_attendances_school_year_id_fkey'
  ) THEN
    ALTER TABLE public.lesson_attendances
      ADD CONSTRAINT lesson_attendances_school_year_id_fkey
      FOREIGN KEY (school_year_id)
      REFERENCES public.studio_school_years(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lesson_attendances_school_year_id
  ON public.lesson_attendances(school_year_id);

ALTER TABLE public.lesson_attendances
  ALTER COLUMN school_year_id SET NOT NULL;


-- 2) replacement_requests.school_year_id (derive from lessons)
ALTER TABLE public.replacement_requests
  ADD COLUMN IF NOT EXISTS school_year_id uuid;

UPDATE public.replacement_requests rr
SET school_year_id = l.school_year_id
FROM public.lessons l
WHERE rr.school_year_id IS NULL
  AND rr.lesson_id = l.id
  AND l.school_year_id IS NOT NULL;

UPDATE public.replacement_requests rr
SET school_year_id = p.school_year_id
FROM public.programs p
WHERE rr.school_year_id IS NULL
  AND rr.program_id = p.id
  AND p.school_year_id IS NOT NULL;

-- Last resort: active year for the studio
UPDATE public.replacement_requests rr
SET school_year_id = sy.id
FROM public.studio_school_years sy
WHERE rr.school_year_id IS NULL
  AND rr.studio_id = sy.studio_id
  AND sy.is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'replacement_requests_school_year_id_fkey'
  ) THEN
    ALTER TABLE public.replacement_requests
      ADD CONSTRAINT replacement_requests_school_year_id_fkey
      FOREIGN KEY (school_year_id)
      REFERENCES public.studio_school_years(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_replacement_requests_studio_year_status
  ON public.replacement_requests(studio_id, school_year_id, status);

ALTER TABLE public.replacement_requests
  ALTER COLUMN school_year_id SET NOT NULL;


-- 3) timesheets.school_year_id (derive from month/year date within studio school-year range)
ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS school_year_id uuid;

UPDATE public.timesheets t
SET school_year_id = sy.id
FROM public.studio_school_years sy
WHERE t.school_year_id IS NULL
  AND sy.studio_id = t.studio_id
  AND make_date(t.year, t.month, 1) BETWEEN sy.starts_on AND sy.ends_on;

-- Fallback: active year
UPDATE public.timesheets t
SET school_year_id = sy.id
FROM public.studio_school_years sy
WHERE t.school_year_id IS NULL
  AND sy.studio_id = t.studio_id
  AND sy.is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'timesheets_school_year_id_fkey'
  ) THEN
    ALTER TABLE public.timesheets
      ADD CONSTRAINT timesheets_school_year_id_fkey
      FOREIGN KEY (school_year_id)
      REFERENCES public.studio_school_years(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_timesheets_studio_school_year
  ON public.timesheets(studio_id, school_year_id);

ALTER TABLE public.timesheets
  ALTER COLUMN school_year_id SET NOT NULL;


-- 4) payrolls.school_year_id (derive from linked timesheet; else month/year)
ALTER TABLE public.payrolls
  ADD COLUMN IF NOT EXISTS school_year_id uuid;

UPDATE public.payrolls p
SET school_year_id = t.school_year_id
FROM public.timesheets t
WHERE p.school_year_id IS NULL
  AND p.timesheet_id = t.id
  AND t.school_year_id IS NOT NULL;

UPDATE public.payrolls p
SET school_year_id = sy.id
FROM public.studio_school_years sy
WHERE p.school_year_id IS NULL
  AND sy.studio_id = p.studio_id
  AND make_date(p.year, p.month, 1) BETWEEN sy.starts_on AND sy.ends_on;

-- Fallback: active year
UPDATE public.payrolls p
SET school_year_id = sy.id
FROM public.studio_school_years sy
WHERE p.school_year_id IS NULL
  AND sy.studio_id = p.studio_id
  AND sy.is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payrolls_school_year_id_fkey'
  ) THEN
    ALTER TABLE public.payrolls
      ADD CONSTRAINT payrolls_school_year_id_fkey
      FOREIGN KEY (school_year_id)
      REFERENCES public.studio_school_years(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payrolls_studio_school_year
  ON public.payrolls(studio_id, school_year_id);

ALTER TABLE public.payrolls
  ALTER COLUMN school_year_id SET NOT NULL;
