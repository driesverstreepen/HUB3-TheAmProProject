-- 046_create_placeholder_memberships_and_dependents.sql
-- Temporary placeholder tables to avoid PGRST205 errors during development
-- Run this in Supabase SQL Editor if you want the app to stop erroring when the
-- features for sub_profiles and studio_memberships aren't yet present.

CREATE TABLE IF NOT EXISTS public.studio_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  studio_id uuid REFERENCES public.studios(id) ON DELETE CASCADE,
  role text,
  created_at timestamptz DEFAULT now()
);

-- NOTE: renamed to `sub_profiles` and expanded for development. Replace with
-- production-ready migration when enabling feature in prod (add RLS policies).
CREATE TABLE IF NOT EXISTS public.sub_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  date_of_birth date,
  street text,
  house_number text,
  house_number_addition text,
  postal_code text,
  city text,
  phone_number text,
  email text,
  -- convenience/full name and address columns
  name text,
  address text,
  created_at timestamptz DEFAULT now()
);

-- Note: these are development placeholders. When you implement the full feature,
-- replace these with the proper schema and RLS policies. Do not rely on these in prod.
