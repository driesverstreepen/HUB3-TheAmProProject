-- Migration 042: Fix user_roles RLS policies to prevent infinite recursion
-- Keep single role per user (user_id is still PRIMARY KEY)
-- NOTE: This migration is superseded by 050/051/052 which remove profile fields
-- Profile data should be in user_profiles or studio_admin_profiles, NOT here

-- Drop and recreate the table with better RLS policies
DROP TABLE IF EXISTS public.user_roles CASCADE;

CREATE TABLE public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user',
  studio_id UUID REFERENCES public.studios(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_user_roles_role ON public.user_roles(role);
CREATE INDEX idx_user_roles_studio_id ON public.user_roles(studio_id) WHERE studio_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Policy: Allow everyone to read all roles
-- This prevents infinite recursion when checking "does user have super_admin role?"
-- It's safe because roles are needed for authorization
DROP POLICY IF EXISTS user_roles_select_all ON public.user_roles;
CREATE POLICY user_roles_select_all ON public.user_roles
  FOR SELECT
  USING (true);

-- Policy: Users can insert their own role entry
DROP POLICY IF EXISTS user_roles_insert_own ON public.user_roles;
CREATE POLICY user_roles_insert_own ON public.user_roles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own profile fields
DROP POLICY IF EXISTS user_roles_update_own ON public.user_roles;
CREATE POLICY user_roles_update_own ON public.user_roles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own role
DROP POLICY IF EXISTS user_roles_delete_own ON public.user_roles;
CREATE POLICY user_roles_delete_own ON public.user_roles
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.user_roles_refresh_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_roles_updated_at_tr ON public.user_roles;
CREATE TRIGGER user_roles_updated_at_tr
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW 
  EXECUTE FUNCTION public.user_roles_refresh_updated_at();

-- End of migration
