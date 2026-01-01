-- Migration 052: Remove profile columns from user_roles table
-- After migrating profile data to user_profiles and studio_admin_profiles,
-- we now clean up user_roles to contain ONLY role relationship data

BEGIN;

-- ============================================================
-- Drop profile columns from user_roles
-- ============================================================

ALTER TABLE public.user_roles DROP COLUMN IF EXISTS first_name;
ALTER TABLE public.user_roles DROP COLUMN IF EXISTS last_name;

-- ============================================================
-- Verify final user_roles schema
-- ============================================================

-- user_roles should now have:
-- - user_id (PK, references auth.users)
-- - role (text)
-- - studio_id (nullable, references studios)
-- - created_at
-- - updated_at
-- NO profile data

COMMIT;

-- END OF MIGRATION 052
-- user_roles is now clean and contains only relationship/role data
