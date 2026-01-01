-- 047_sync_legal_documents_document_type.sql
-- Ensure `legal_documents` exposes `document_type` column expected by application code.
-- Some earlier schema used `doc_type` while newer code/migrations expect `document_type`.
-- This migration adds `document_type` if missing and copies values from `doc_type`.

BEGIN;

-- Add column if it doesn't exist
ALTER TABLE IF EXISTS public.legal_documents
  ADD COLUMN IF NOT EXISTS document_type TEXT;

-- If legacy column `doc_type` exists, copy values across where needed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='legal_documents' AND column_name='doc_type') THEN
    UPDATE public.legal_documents
    SET document_type = doc_type
    WHERE document_type IS NULL AND doc_type IS NOT NULL;
  END IF;
END$$;

-- If `document_type` is still null for any row, try to infer from content (best-effort)
UPDATE public.legal_documents
SET document_type = 
  CASE
    WHEN LOWER(content) LIKE '%privacy%' THEN 'privacy_policy'
    WHEN LOWER(content) LIKE '%voorwaarden%' OR LOWER(content) LIKE '%algemene voorwaarden%' THEN 'terms_of_service'
    ELSE document_type
  END
WHERE document_type IS NULL;

COMMIT;

-- Note: This is a compatibility migration for development environments where older
-- migrations created `doc_type`. After running, application code that references
-- `document_type` will work. Consider consolidating the schema (removing `doc_type`)
-- once you confirm everything is migrated and tested.
