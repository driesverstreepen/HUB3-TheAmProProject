-- AmPro: allow multiple program types (performance/workshop)

ALTER TABLE public.ampro_programmas
  ADD COLUMN IF NOT EXISTS program_type text;

-- Backfill
UPDATE public.ampro_programmas
SET program_type = 'performance'
WHERE program_type IS NULL;

-- Default + not null
ALTER TABLE public.ampro_programmas
  ALTER COLUMN program_type SET DEFAULT 'performance';

ALTER TABLE public.ampro_programmas
  ALTER COLUMN program_type SET NOT NULL;

-- Add constraint if missing (constraint name can differ across DBs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.ampro_programmas'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%program_type%'
      AND pg_get_constraintdef(c.oid) ILIKE '%performance%'
      AND pg_get_constraintdef(c.oid) ILIKE '%workshop%'
  ) THEN
    ALTER TABLE public.ampro_programmas
      ADD CONSTRAINT ampro_programmas_program_type_check
      CHECK (program_type IN ('performance', 'workshop'));
  END IF;
END $$;
