-- Verification query: Check which columns exist in programs table
-- Run this first to see what's missing
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'programs'
ORDER BY ordinal_position;

-- If 'capacity' column is missing, uncomment and run these ALTER statements:
-- ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS capacity INTEGER;
-- ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2);
-- ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

-- Verify the fix worked:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'programs' AND column_name IN ('capacity', 'price', 'is_public');
