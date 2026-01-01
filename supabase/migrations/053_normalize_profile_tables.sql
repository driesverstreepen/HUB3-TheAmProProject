-- Migration 053: Normalize profile tables to eliminate duplication
-- Strategy: user_profiles = single source of truth for ALL personal data
-- studio_admin_profiles = ONLY studio-specific fields (organization_name, studio_id)
-- IDEMPOTENT: Safe to run even if columns already removed

BEGIN;

-- ============================================================
-- PART 1: Ensure all users have a user_profiles entry
-- ============================================================

-- Copy any missing profiles from studio_admin_profiles to user_profiles (if columns exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'studio_admin_profiles' 
      AND column_name = 'first_name'
  ) THEN
    -- Columns exist, migrate data
    INSERT INTO public.user_profiles (user_id, first_name, last_name, date_of_birth, phone, email, created_at)
    SELECT sap.user_id, sap.first_name, sap.last_name, sap.date_of_birth, sap.phone, sap.email, COALESCE(sap.created_at, now())
    FROM public.studio_admin_profiles sap
    LEFT JOIN public.user_profiles up ON up.user_id = sap.user_id
    WHERE up.user_id IS NULL
      AND sap.user_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE SET
      first_name = COALESCE(EXCLUDED.first_name, public.user_profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, public.user_profiles.last_name),
      date_of_birth = COALESCE(EXCLUDED.date_of_birth, public.user_profiles.date_of_birth),
      phone = COALESCE(EXCLUDED.phone, public.user_profiles.phone),
      email = COALESCE(EXCLUDED.email, public.user_profiles.email);
    
    RAISE NOTICE 'Migrated personal data from studio_admin_profiles to user_profiles';
  ELSE
    RAISE NOTICE 'Personal data columns not found in studio_admin_profiles - skipping migration (already done?)';
  END IF;
END $$;

-- Also copy any profiles still in user_roles (if 052 hasn't run yet)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_roles' 
      AND column_name = 'first_name'
  ) THEN
    -- Columns exist, migrate data
    INSERT INTO public.user_profiles (user_id, first_name, last_name, created_at)
    SELECT ur.user_id, ur.first_name, ur.last_name, COALESCE(ur.created_at, now())
    FROM public.user_roles ur
    LEFT JOIN public.user_profiles up ON up.user_id = ur.user_id
    WHERE up.user_id IS NULL
      AND ur.user_id IS NOT NULL
      AND (ur.first_name IS NOT NULL OR ur.last_name IS NOT NULL)
    ON CONFLICT (user_id) DO NOTHING;
    
    RAISE NOTICE 'Migrated personal data from user_roles to user_profiles';
  ELSE
    RAISE NOTICE 'Personal data columns not found in user_roles - skipping migration';
  END IF;
END $$;

-- Create empty profiles for any auth users without profiles yet
INSERT INTO public.user_profiles (user_id, created_at)
SELECT au.id, now()
FROM auth.users au
LEFT JOIN public.user_profiles up ON up.user_id = au.id
WHERE up.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- PART 2: Remove duplicate personal fields from studio_admin_profiles
-- ============================================================

-- Drop personal data columns (these now live ONLY in user_profiles)
ALTER TABLE public.studio_admin_profiles
  DROP COLUMN IF EXISTS first_name CASCADE,
  DROP COLUMN IF EXISTS last_name CASCADE,
  DROP COLUMN IF EXISTS date_of_birth CASCADE,
  DROP COLUMN IF EXISTS phone CASCADE,
  DROP COLUMN IF EXISTS email CASCADE,
  DROP COLUMN IF EXISTS address CASCADE,
  DROP COLUMN IF EXISTS postal_code CASCADE,
  DROP COLUMN IF EXISTS city CASCADE;

-- Keep only studio-specific fields:
-- - user_id (PK, FK to auth.users)
-- - studio_id (FK to studios)
-- - organization_name (studio-specific)
-- - created_at, updated_at

-- Ensure organization_name column exists (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'studio_admin_profiles'
      AND column_name = 'organization_name'
  ) THEN
    ALTER TABLE public.studio_admin_profiles ADD COLUMN organization_name TEXT;
  END IF;
END $$;

COMMIT;

-- END OF MIGRATION 053
-- Result: user_profiles = canonical personal data for ALL users
--         studio_admin_profiles = studio-specific data only (organization_name, studio_id)
