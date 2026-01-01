-- 054_add_published_at_and_is_active_to_legal_documents.sql
-- Add published_at (timestamptz), effective_date (date) and is_active (boolean) to legal_documents.

BEGIN;

-- Add columns if they don't exist
ALTER TABLE IF EXISTS public.legal_documents
  ADD COLUMN IF NOT EXISTS published_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS effective_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT FALSE;

-- Backfill published_at with created_at where missing
UPDATE public.legal_documents
SET published_at = created_at
WHERE published_at IS NULL AND created_at IS NOT NULL;

-- For each document_type, mark the latest created_at row as active
WITH latest AS (
  SELECT DISTINCT ON (document_type) id
  FROM public.legal_documents
  ORDER BY document_type, created_at DESC
)
UPDATE public.legal_documents
SET is_active = (id IN (SELECT id FROM latest));

COMMIT;
