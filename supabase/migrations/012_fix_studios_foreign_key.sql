-- Drop the incorrect foreign key constraint
ALTER TABLE public.studios DROP CONSTRAINT IF EXISTS studios_eigenaar_id_fkey;

-- Add the correct foreign key pointing to auth.users (not public.users)
ALTER TABLE public.studios 
ADD CONSTRAINT studios_eigenaar_id_fkey 
FOREIGN KEY (eigenaar_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Verify the constraint is correct
SELECT 
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    confrelid::regclass AS referenced_table
FROM pg_constraint
WHERE conname = 'studios_eigenaar_id_fkey';
