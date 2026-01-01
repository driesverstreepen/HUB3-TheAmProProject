-- 009_create_user_roles.sql
-- Create a user_roles table to store role-related metadata for users (idempotent)
-- NOTE: This migration is superseded by 050/051/052 which separate profile data
-- If running fresh, profile fields should NOT be in user_roles

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user',
  studio_id UUID REFERENCES public.studios(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- Enable RLS and policies so users can update their own role metadata and super_admins can manage
ALTER TABLE IF EXISTS public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'user_roles_allow_manage_owner'
      AND polrelid = 'public.user_roles'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY user_roles_allow_manage_owner ON public.user_roles FOR ALL USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = ''super_admin'')) WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = ''super_admin''))';
  END IF;
END$$;

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.user_roles_refresh_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'user_roles_updated_at_tr') THEN
    CREATE TRIGGER user_roles_updated_at_tr
    BEFORE UPDATE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.user_roles_refresh_updated_at();
  END IF;
END$$;

-- End of migration
