-- Migrate programs table from Dutch to English column names
-- and add missing columns to match the application schema

-- Rename existing Dutch columns to English
ALTER TABLE public.programs RENAME COLUMN naam TO title;
ALTER TABLE public.programs RENAME COLUMN beschrijving TO description;
ALTER TABLE public.programs RENAME COLUMN type TO program_type;
ALTER TABLE public.programs RENAME COLUMN prijs TO price;
ALTER TABLE public.programs RENAME COLUMN max_deelnemers TO capacity;
ALTER TABLE public.programs RENAME COLUMN actief TO is_public;

-- Add missing columns that the application expects
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS dance_style TEXT;
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS level TEXT 
  CHECK (level IN ('beginner', 'intermediate', 'advanced', 'all_levels'));

-- Update the program_type column to match the expected constraint
-- First drop the old constraint if it exists
ALTER TABLE public.programs DROP CONSTRAINT IF EXISTS programs_type_check;
ALTER TABLE public.programs DROP CONSTRAINT IF EXISTS programs_program_type_check;

-- Add the new constraint
ALTER TABLE public.programs ADD CONSTRAINT programs_program_type_check 
  CHECK (program_type IN ('group', 'workshop'));

-- Remove old date columns that are now in separate tables (group_details/workshop_details)
ALTER TABLE public.programs DROP COLUMN IF EXISTS start_datum;
ALTER TABLE public.programs DROP COLUMN IF EXISTS eind_datum;

-- Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'programs' 
ORDER BY ordinal_position;
