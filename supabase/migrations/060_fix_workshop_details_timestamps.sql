-- Migration: Fix workshop_details date default and timestamps
-- Non-destructive operations: DROP fixed default on `date`, ensure timestamps have sensible defaults,
-- add `updated_at` column and trigger to keep it current, and add an optional unique index on program_id.
-- Run this in dev/staging first. Do NOT drop columns or change PKs here.

BEGIN;

-- 1) Remove any accidental fixed default on `date`
ALTER TABLE IF EXISTS public.workshop_details
  ALTER COLUMN date DROP DEFAULT;

-- 2) Ensure created_at is timestamptz with default now() and not null
ALTER TABLE IF EXISTS public.workshop_details
  ALTER COLUMN created_at SET DEFAULT now();

-- If created_at is nullable and you prefer NOT NULL, you can set NOT NULL here only after
-- verifying existing rows have created_at populated. We leave it nullable-safe for now.

-- 3) Add updated_at column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workshop_details' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.workshop_details
      ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END$$;

-- 4) Create or replace a helper function to set updated_at on update
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 5) Create trigger (drop existing if present) to run the function before update
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_workshop_details_updated_at') THEN
    DROP TRIGGER trg_workshop_details_updated_at ON public.workshop_details;
  END IF;
  CREATE TRIGGER trg_workshop_details_updated_at
    BEFORE UPDATE ON public.workshop_details
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
END$$;

-- 6) Optional: enforce one-to-one relationship (non-destructive: create unique index if missing)
-- If your application expects at most one workshop_details row per program, enable the unique index.
CREATE UNIQUE INDEX IF NOT EXISTS ux_workshop_details_program_id ON public.workshop_details(program_id);

COMMIT;

-- Verification queries (run separately to validate results):
-- SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'workshop_details';
-- SELECT id, program_id, date, start_time, end_time, created_at, updated_at FROM public.workshop_details LIMIT 50;
