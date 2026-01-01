-- Migration: convert public_teacher_profiles.dance_style from text/varchar CSV to Postgres text[]
-- This converts existing comma-separated values into a text[] using regexp_split_to_array

BEGIN;

-- Make a backup column in case something goes wrong
ALTER TABLE public.public_teacher_profiles
  ADD COLUMN IF NOT EXISTS dance_style_backup text;

UPDATE public.public_teacher_profiles
SET dance_style_backup = dance_style::text
WHERE dance_style IS NOT NULL;

-- Alter the column type to text[] using safe conversion
ALTER TABLE public.public_teacher_profiles
  ALTER COLUMN dance_style TYPE text[] USING (
    CASE
      WHEN dance_style IS NULL OR trim(dance_style) = '' THEN NULL
      ELSE regexp_split_to_array(dance_style, '\\s*,\\s*')
    END
  );

COMMIT;
