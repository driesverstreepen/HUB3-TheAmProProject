-- Migration 050: Consolidate profile tables and fix schema conflicts
-- This migration ensures clean separation:
-- - user_profiles: for regular users (references auth.users)
-- - studio_admin_profiles: for studio owners (references auth.users)
-- - user_roles: ONLY for role relationships (NO profile data)

BEGIN;

-- ============================================================
-- PART 1: Ensure user_profiles table exists with correct schema
-- ============================================================

-- Drop and recreate to ensure clean state
-- (Safe because we'll migrate data in next migration)
DROP TABLE IF EXISTS public.user_profiles CASCADE;

CREATE TABLE public.user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  date_of_birth DATE,
  phone TEXT,
  email TEXT,
  street TEXT,
  house_number TEXT,
  house_number_addition TEXT,
  postal_code TEXT,
  city TEXT,
  profile_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for lookups
CREATE INDEX idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX idx_user_profiles_postal_city ON public.user_profiles(postal_code, city);

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Policies: users can manage their own profile
DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;
CREATE POLICY "user_profiles_select_own" ON public.user_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profiles_insert_own" ON public.user_profiles;
CREATE POLICY "user_profiles_insert_own" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profiles_update_own" ON public.user_profiles;
CREATE POLICY "user_profiles_update_own" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_profiles_updated_at_tr ON public.user_profiles;
CREATE TRIGGER user_profiles_updated_at_tr
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_user_profiles_updated_at();


-- ============================================================
-- PART 2: Fix studio_admin_profiles to have user_id as single PK
-- ============================================================
-- NOTE: After migration 053, this table will contain ONLY studio-specific fields
-- Personal data (first_name, last_name, etc.) will be in user_profiles

-- Drop and recreate with correct schema
DROP TABLE IF EXISTS public.studio_admin_profiles CASCADE;

CREATE TABLE public.studio_admin_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  studio_id UUID REFERENCES public.studios(id) ON DELETE CASCADE,
  organization_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for lookups
CREATE INDEX idx_studio_admin_profiles_user_id ON public.studio_admin_profiles(user_id);
CREATE INDEX idx_studio_admin_profiles_studio_id ON public.studio_admin_profiles(studio_id);

-- Enable RLS
ALTER TABLE public.studio_admin_profiles ENABLE ROW LEVEL SECURITY;

-- Policies: studio admins can manage their own profile
DROP POLICY IF EXISTS "studio_admin_profiles_select_own" ON public.studio_admin_profiles;
CREATE POLICY "studio_admin_profiles_select_own" ON public.studio_admin_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "studio_admin_profiles_insert_own" ON public.studio_admin_profiles;
CREATE POLICY "studio_admin_profiles_insert_own" ON public.studio_admin_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "studio_admin_profiles_update_own" ON public.studio_admin_profiles;
CREATE POLICY "studio_admin_profiles_update_own" ON public.studio_admin_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Additional policy: studio admins can view other admins of same studio
DROP POLICY IF EXISTS "studio_admin_profiles_select_same_studio" ON public.studio_admin_profiles;
CREATE POLICY "studio_admin_profiles_select_same_studio" ON public.studio_admin_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.studio_id = studio_admin_profiles.studio_id
        AND ur.role IN ('studio_admin', 'admin')
    )
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_studio_admin_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS studio_admin_profiles_updated_at_tr ON public.studio_admin_profiles;
CREATE TRIGGER studio_admin_profiles_updated_at_tr
  BEFORE UPDATE ON public.studio_admin_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_studio_admin_profiles_updated_at();

COMMIT;

-- END OF MIGRATION 050
-- Next: run 051_migrate_profile_data_from_user_roles.sql to move existing data
