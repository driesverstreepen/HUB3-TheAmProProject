-- 004_add_super_admin_and_user_consents.sql
-- Add 'super_admin' role support and create user_consents + legal_documents tables and helper function.
-- Idempotent migration safe to run multiple times.

-- 1) Ensure uuid extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2) Remove existing restrictive CHECK constraint on users.role if it references the old role list
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
  LOOP
    -- fetch constraint definition and check if it mentions 'studio_admin' (heuristic to find the generated check)
    IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = c.conname AND conrelid = 'public.users'::regclass) ILIKE '%studio_admin%' THEN
      EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT IF EXISTS %I', c.conname);
    END IF;
  END LOOP;
END$$;

-- 3) Add new CHECK constraint that includes super_admin (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%super_admin%'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT chk_users_role_allowed CHECK (role IN ('studio_admin', 'user', 'super_admin'));
  END IF;
END$$;

-- 4) Create legal_documents table to store versions of Terms/Privacy
CREATE TABLE IF NOT EXISTS public.legal_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_type TEXT NOT NULL,
  content TEXT,
  version TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_type ON public.legal_documents(doc_type);

-- 5) Helper function to return latest legal document by type (used by frontend SignUp flow)
CREATE OR REPLACE FUNCTION public.get_latest_legal_document(p_doc_type TEXT)
RETURNS TABLE(id UUID, doc_type TEXT, content TEXT, version TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql AS $$
  SELECT id, doc_type, content, version, created_at
  FROM public.legal_documents
  WHERE doc_type = p_doc_type
  ORDER BY created_at DESC
  LIMIT 1;
$$;

-- 6) Create user_consents table to record which users accepted which document version
CREATE TABLE IF NOT EXISTS public.user_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_version TEXT,
  consented_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user ON public.user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_doc ON public.user_consents(document_type);

-- 7) Enable RLS on user_consents and create policies
ALTER TABLE IF EXISTS public.user_consents ENABLE ROW LEVEL SECURITY;

-- Allow users to INSERT their own consent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'user_consents_allow_insert_owner'
      AND polrelid = 'public.user_consents'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY user_consents_allow_insert_owner ON public.user_consents FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END$$;

-- Allow users to SELECT their own consents; allow super_admins to SELECT all
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'user_consents_allow_select_owner_or_super'
      AND polrelid = 'public.user_consents'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY user_consents_allow_select_owner_or_super ON public.user_consents FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = ''super_admin''))';
  END IF;
END$$;

-- Allow users to DELETE/UPDATE their own consents (and super_admins)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'user_consents_allow_update_owner_or_super'
      AND polrelid = 'public.user_consents'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY user_consents_allow_update_owner_or_super ON public.user_consents FOR ALL USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = ''super_admin''))';
  END IF;
END$$;

-- 8) Done

