-- Migration 097: Program waitlists

BEGIN;

-- Per-program toggle to enable digital waitlist when capacity is set
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS waitlist_enabled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_programs_waitlist_enabled
  ON public.programs(waitlist_enabled)
  WHERE waitlist_enabled = true;

COMMIT;
