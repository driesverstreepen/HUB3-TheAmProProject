-- Add age restriction columns to programs table
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS min_age INTEGER;
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS max_age INTEGER;

-- Add constraint to ensure min_age is less than max_age when both are set
ALTER TABLE public.programs ADD CONSTRAINT programs_age_range_check 
  CHECK (min_age IS NULL OR max_age IS NULL OR min_age <= max_age);

-- Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'programs' 
  AND column_name IN ('min_age', 'max_age');
