-- Migration: default roster role name
-- New accepted enrollments should default to role_name = 'Dancer' when not specified.

BEGIN;

ALTER TABLE public.ampro_roster
  ALTER COLUMN role_name SET DEFAULT 'Dancer';

-- Backfill existing rows that have no role set.
UPDATE public.ampro_roster
SET role_name = 'Dancer'
WHERE role_name IS NULL OR btrim(role_name) = '';

COMMIT;
