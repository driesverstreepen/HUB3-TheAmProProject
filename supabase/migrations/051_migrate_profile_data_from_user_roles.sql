-- Migration 051: Migrate profile data from user_roles to appropriate profile tables
-- This migration moves first_name, last_name, and other profile fields from user_roles
-- into user_profiles (for ALL users, including studio admins)
-- studio_admin_profiles gets ONLY studio_id (no personal data)
-- IDEMPOTENT: Safe to run even if user_roles columns already removed

BEGIN;

-- ============================================================
-- PART 1: Migrate ALL user data to user_profiles (if columns exist)
-- ============================================================

-- Check if first_name column still exists in user_roles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_roles' 
      AND column_name = 'first_name'
  ) THEN
    -- Column exists, migrate data
    INSERT INTO public.user_profiles (
      user_id,
      first_name,
      last_name,
      created_at
    )
    SELECT 
      ur.user_id,
      ur.first_name,
      ur.last_name,
      ur.created_at
    FROM public.user_roles ur
    WHERE ur.first_name IS NOT NULL
      AND ur.user_id NOT IN (SELECT user_id FROM public.user_profiles)
    ON CONFLICT (user_id) DO UPDATE SET
      first_name = COALESCE(EXCLUDED.first_name, public.user_profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, public.user_profiles.last_name);
    
    RAISE NOTICE 'Migrated profile data from user_roles to user_profiles';
  ELSE
    RAISE NOTICE 'Column first_name not found in user_roles - skipping migration (already done?)';
  END IF;
END $$;

-- ============================================================
-- PART 2: Create studio_admin_profiles entries (without personal data)
-- ============================================================

-- For users with role 'studio_admin', create studio_admin_profiles entry
-- with ONLY studio_id (personal data is in user_profiles)
INSERT INTO public.studio_admin_profiles (
  user_id,
  studio_id,
  created_at
)
SELECT 
  ur.user_id,
  ur.studio_id,
  ur.created_at
FROM public.user_roles ur
WHERE ur.role = 'studio_admin'
  AND ur.studio_id IS NOT NULL
  AND ur.user_id NOT IN (SELECT user_id FROM public.studio_admin_profiles)
ON CONFLICT (user_id) DO UPDATE SET
  studio_id = EXCLUDED.studio_id;

-- ============================================================
-- PART 3: Handle users with NO role entry yet but exist in auth.users
-- ============================================================

-- Create empty user_profiles for any authenticated users who don't have a profile yet
INSERT INTO public.user_profiles (user_id)
SELECT au.id
FROM auth.users au
WHERE au.id NOT IN (SELECT user_id FROM public.user_profiles)
ON CONFLICT (user_id) DO NOTHING;

COMMIT;

-- END OF MIGRATION 051
-- Next: run 052_cleanup_user_roles.sql to remove profile columns from user_roles
-- Note: After this migration, ALL personal data is in user_profiles
--       studio_admin_profiles contains ONLY studio_id (no personal data yet)
