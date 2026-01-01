-- 022_add_user_profiles.sql
-- Idempotent migration to create a user_profiles table for optional/extended profile fields.
-- Safe to run multiple times. Use in Supabase SQL editor or as a migration.

-- 1) Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id uuid PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  street TEXT,
  house_number TEXT,
  house_number_addition TEXT,
  postal_code TEXT,
  city TEXT,
  phone TEXT,
  profile_completed BOOLEAN DEFAULT FALSE,
  updated_at timestamptz DEFAULT now()
);

-- 2) Create an index for postal_code/city searches
CREATE INDEX IF NOT EXISTS idx_user_profiles_postal_city ON public.user_profiles(postal_code, city);

-- 3) Add foreign key constraint only if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_profiles_users'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT fk_user_profiles_users FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END$$;

-- 4) Best-effort backfill from existing users. This is heuristic: splits `naam` on first space.
INSERT INTO public.user_profiles (user_id, first_name, last_name, display_name)
SELECT id,
       split_part(naam, ' ', 1) AS first_name,
       NULLIF(regexp_replace(naam, '^\s*[^\s]+\s*', ''), '') AS last_name,
       naam AS display_name
FROM public.users
WHERE coalesce(naam,'') <> ''
  AND id NOT IN (SELECT user_id FROM public.user_profiles);

-- 5) Enable Row Level Security and create safe policies so users can manage their own profile
ALTER TABLE IF EXISTS public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Allow the owner to INSERT their own profile (check user_id matches auth.uid())
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'allow_profile_insert_for_self'
      AND polrelid = 'public.user_profiles'::regclass
  ) THEN
    -- execute the CREATE POLICY via a single-quoted string to avoid any dollar-quote parsing issues
    EXECUTE 'CREATE POLICY allow_profile_insert_for_self ON public.user_profiles
      FOR INSERT
      WITH CHECK (auth.uid() = user_id)';
  END IF;
END$$;

-- Allow the owner to UPDATE their own profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'allow_profile_update_for_self'
      AND polrelid = 'public.user_profiles'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY allow_profile_update_for_self ON public.user_profiles
      FOR UPDATE
      USING (auth.uid() = user_id)';
  END IF;
END$$;

-- Allow SELECT for everyone on profiles (or tighten as needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'allow_profile_select_public'
      AND polrelid = 'public.user_profiles'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY allow_profile_select_public ON public.user_profiles
      FOR SELECT
      USING (true)';
  END IF;
END$$;

-- 6) (Optional) keep updated_at current on modification
CREATE OR REPLACE FUNCTION public.refresh_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'user_profiles_updated_at_tr') THEN
    CREATE TRIGGER user_profiles_updated_at_tr
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.refresh_updated_at();
  END IF;
END$$;

-- End of migration
