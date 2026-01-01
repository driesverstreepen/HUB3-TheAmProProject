-- Add denormalized display fields to evaluations for studio UI
BEGIN;

ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS program_title text NULL,
  ADD COLUMN IF NOT EXISTS teacher_name text NULL,
  ADD COLUMN IF NOT EXISTS student_name text NULL,
  ADD COLUMN IF NOT EXISTS student_email text NULL;

COMMIT;