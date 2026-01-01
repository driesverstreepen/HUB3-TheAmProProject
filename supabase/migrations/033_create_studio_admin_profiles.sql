-- Migration: create studio_admin_profiles table and RLS policies
-- NOTE: This migration is superseded by 050 which uses user_id as single PK (not composite)
-- If running fresh database, skip this and use 050 instead

BEGIN;

-- DEPRECATED: This version uses composite key (user_id, studio_id)
-- New version in 050 uses user_id as single PK
-- Keeping for historical reference but recommend skipping this migration

CREATE TABLE IF NOT EXISTS public.studio_admin_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  studio_id UUID REFERENCES public.studios(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  date_of_birth DATE,
  phone TEXT,
  email TEXT,
  organization_name TEXT,
  address TEXT,
  postal_code TEXT,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.studio_admin_profiles ENABLE ROW LEVEL SECURITY;

-- Allow the profile owner to SELECT/INSERT/UPDATE their own row
DROP POLICY IF EXISTS "Users kunnen eigen studio admin profiel SELECT" ON public.studio_admin_profiles;
CREATE POLICY "Users kunnen eigen studio admin profiel SELECT" ON public.studio_admin_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users kunnen eigen studio admin profiel INSERT" ON public.studio_admin_profiles;
CREATE POLICY "Users kunnen eigen studio admin profiel INSERT" ON public.studio_admin_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users kunnen eigen studio admin profiel UPDATE" ON public.studio_admin_profiles;
CREATE POLICY "Users kunnen eigen studio admin profiel UPDATE" ON public.studio_admin_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Permissive fallback: allow any authenticated user to read/write their own row by user_id match
-- This ensures even if user_roles is missing, the owner can still access
DROP POLICY IF EXISTS "Authenticated users own profile fallback" ON public.studio_admin_profiles;
CREATE POLICY "Authenticated users own profile fallback" ON public.studio_admin_profiles
  FOR ALL USING (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- Allow studio admins (and admins) of the same studio to SELECT/INSERT/UPDATE these profiles
DROP POLICY IF EXISTS "Studio admins kunnen profile SELECT" ON public.studio_admin_profiles;
CREATE POLICY "Studio admins kunnen profile SELECT" ON public.studio_admin_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.studio_id = public.studio_admin_profiles.studio_id
        AND ur.role IN ('studio_admin','admin')
    )
  );

DROP POLICY IF EXISTS "Studio admins kunnen profile INSERT" ON public.studio_admin_profiles;
CREATE POLICY "Studio admins kunnen profile INSERT" ON public.studio_admin_profiles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.studio_id = public.studio_admin_profiles.studio_id
        AND ur.role IN ('studio_admin','admin')
    )
  );

DROP POLICY IF EXISTS "Studio admins kunnen profile UPDATE" ON public.studio_admin_profiles;
CREATE POLICY "Studio admins kunnen profile UPDATE" ON public.studio_admin_profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.studio_id = public.studio_admin_profiles.studio_id
        AND ur.role IN ('studio_admin','admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.studio_id = public.studio_admin_profiles.studio_id
        AND ur.role IN ('studio_admin','admin')
    )
  );

COMMIT;
