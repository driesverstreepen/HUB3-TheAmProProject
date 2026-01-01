-- 048_add_sub_profiles_rls.sql
-- Enable Row Level Security on sub_profiles and add policies so parents can
-- manage their own sub-profiles. Service role bypasses RLS and can be used
-- by server-side code to read sub_profiles for snapshotting.

ALTER TABLE IF EXISTS public.sub_profiles
  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'allow_select_sub_profiles' AND schemaname = 'public' AND tablename = 'sub_profiles'
  ) THEN
    CREATE POLICY allow_select_sub_profiles
      ON public.sub_profiles
      FOR SELECT
      USING (parent_user_id = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'allow_insert_sub_profiles' AND schemaname = 'public' AND tablename = 'sub_profiles'
  ) THEN
    CREATE POLICY allow_insert_sub_profiles
      ON public.sub_profiles
      FOR INSERT
      WITH CHECK (parent_user_id = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'allow_update_sub_profiles' AND schemaname = 'public' AND tablename = 'sub_profiles'
  ) THEN
    CREATE POLICY allow_update_sub_profiles
      ON public.sub_profiles
      FOR UPDATE
      USING (parent_user_id = auth.uid())
      WITH CHECK (parent_user_id = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'allow_delete_sub_profiles' AND schemaname = 'public' AND tablename = 'sub_profiles'
  ) THEN
    CREATE POLICY allow_delete_sub_profiles
      ON public.sub_profiles
      FOR DELETE
      USING (parent_user_id = auth.uid());
  END IF;
END$$;

-- NOTE: The Supabase service role (SUPABASE_SERVICE_ROLE_KEY) bypasses RLS.
-- Server-side processes that need to read sub_profiles for snapshotting should
-- use the service role client. Test these policies in staging before rolling
-- out to production.
