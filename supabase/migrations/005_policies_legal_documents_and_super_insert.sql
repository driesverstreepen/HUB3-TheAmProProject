-- 005_policies_legal_documents_and_super_insert.sql
-- Ensure user_consents INSERT allows super_admin and add RLS policies for legal_documents

-- 1) Update user_consents insert policy to allow super_admin to insert on behalf of users
DO $$
BEGIN
  -- drop existing policy if present
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'user_consents_allow_insert_owner'
      AND polrelid = 'public.user_consents'::regclass
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS user_consents_allow_insert_owner ON public.user_consents';
  END IF;

  -- create new policy that allows owners or super_admins
  EXECUTE 'CREATE POLICY user_consents_allow_insert_owner ON public.user_consents FOR INSERT WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = ''super_admin''))';
END$$;

-- 2) Ensure legal_documents table has RLS and policies
ALTER TABLE IF EXISTS public.legal_documents ENABLE ROW LEVEL SECURITY;

-- Allow everyone to SELECT latest documents (public read)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'legal_documents_allow_select_public'
      AND polrelid = 'public.legal_documents'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY legal_documents_allow_select_public ON public.legal_documents FOR SELECT USING (true)';
  END IF;
END$$;

-- Allow only super_admins to INSERT/UPDATE/DELETE (manage documents)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'legal_documents_manage_super'
      AND polrelid = 'public.legal_documents'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY legal_documents_manage_super ON public.legal_documents FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = ''super_admin'')) WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = ''super_admin''))';
  END IF;
END$$;

-- 3) Done
