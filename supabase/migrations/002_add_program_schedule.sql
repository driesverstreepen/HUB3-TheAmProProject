-- Migration: add schedule columns to programs and backfill from group_details
-- Generated: October 30, 2025

BEGIN;

-- Add nullable schedule columns to programs
ALTER TABLE IF EXISTS public.programs
  ADD COLUMN IF NOT EXISTS weekday integer,
  ADD COLUMN IF NOT EXISTS start_time time without time zone,
  ADD COLUMN IF NOT EXISTS end_time time without time zone;

-- Backfill programs.* from the first group_details row per program (ordered by created_at)
WITH first_group AS (
  SELECT DISTINCT ON (program_id) program_id, weekday, start_time, end_time
  FROM public.group_details
  ORDER BY program_id, created_at
)
UPDATE public.programs p
SET weekday = f.weekday,
    start_time = f.start_time,
    end_time = f.end_time
FROM first_group f
WHERE p.id = f.program_id;

-- Add foreign key constraint so group_details.program_id references programs.id (if not already present)
-- Add foreign key constraint safely (Postgres doesn't support ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_details_program_id_fkey'
  ) THEN
    ALTER TABLE public.group_details
      ADD CONSTRAINT group_details_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;
  END IF;
END$$;

COMMIT;
