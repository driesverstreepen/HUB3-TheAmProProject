-- 008_ensure_rls_legal_documents.sql
-- Ensure RLS and expected policies exist on public.legal_documents (idempotent)

-- Enable RLS if not already
ALTER TABLE IF EXISTS public.legal_documents ENABLE ROW LEVEL SECURITY;

-- Ensure public SELECT policy exists
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

-- Ensure manage policy (super_admin only) exists
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

-- Optional: ensure the helper function exists (idempotent, re-creates)
CREATE OR REPLACE FUNCTION public.get_latest_legal_document(p_doc_type TEXT)
RETURNS TABLE(id UUID, doc_type TEXT, content TEXT, version TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql AS $$
  SELECT id, doc_type, content, version, created_at
  FROM public.legal_documents
  WHERE doc_type = p_doc_type
  ORDER BY created_at DESC
  LIMIT 1;
$$;

-- End of migration
