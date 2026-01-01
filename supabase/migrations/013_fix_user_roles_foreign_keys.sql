-- Fix user_roles foreign key to point to auth.users instead of public.users
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Also fix the studio_id foreign key if it exists
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_studio_id_fkey;

ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_studio_id_fkey 
FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;

-- Verify the constraints
SELECT 
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    confrelid::regclass AS referenced_table
FROM pg_constraint
WHERE conrelid = 'public.user_roles'::regclass
AND contype = 'f';
