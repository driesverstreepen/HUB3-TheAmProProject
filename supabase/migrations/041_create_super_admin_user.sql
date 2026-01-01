-- Migration 041: Create Super Admin User
-- This migration adds super_admin role for an existing user

-- ⚠️ INSTRUCTIES:
-- 1. Voer eerst migration 042 uit (fix_user_roles_composite_key.sql)
-- 2. Log in op je Supabase dashboard SQL Editor
-- 3. Voer deze query uit om je user ID te vinden:

SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 10;

-- 4. Kopieer de ID en vervang deze hieronder
-- 5. Uncomment en voer de INSERT/UPDATE query uit:

-- INSERT INTO user_roles (user_id, role, created_at)
-- VALUES ('VERVANG-MET-JOUW-USER-ID', 'super_admin', NOW())
-- ON CONFLICT (user_id) 
-- DO UPDATE SET role = 'super_admin', studio_id = NULL;

-- Deze query maakt een nieuwe user_roles entry of update de bestaande naar super_admin

