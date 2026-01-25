-- Migration 220: Create table for legal_documents
-- Stores text of privacy policy / terms with versioning and publish flags

DO $$
BEGIN
  IF to_regclass('public.legal_documents') IS NULL THEN
    CREATE TABLE public.legal_documents (
      id uuid primary key default gen_random_uuid(),
      document_type text not null,
      studio_id uuid null,
      content text null,
      version text null,
      created_at timestamptz not null default now(),
      effective_date date null,
      is_active boolean not null default false,
      created_by uuid null,
      published_at timestamptz null
    );

    -- Ensure a document_type+version+studio combination is unique (treat NULL studio as empty)
    CREATE UNIQUE INDEX legal_documents_unique_idx ON public.legal_documents(
      document_type,
      COALESCE(version, ''),
      COALESCE(CAST(studio_id AS text), '')
    );
  END IF;
END$$;

-- Note: Depending on your RLS policies you may need to add policies to allow
-- admins to insert/publish and anonymous/unauthenticated users to read published docs.
