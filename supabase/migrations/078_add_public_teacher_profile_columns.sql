-- Migration 078: add city and dance_style to public_teacher_profiles
BEGIN;

ALTER TABLE public_teacher_profiles
  ADD COLUMN IF NOT EXISTS city text NULL,
  ADD COLUMN IF NOT EXISTS dance_style text NULL;

COMMIT;

-- END MIGRATION 078
