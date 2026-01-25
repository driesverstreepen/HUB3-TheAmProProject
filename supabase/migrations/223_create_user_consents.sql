-- Migration 223: Create user_consents table (GDPR tracking)

DO $$
BEGIN
  IF to_regclass('public.user_consents') IS NULL THEN
    CREATE TABLE public.user_consents (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      document_type text not null,
      document_version text null,
      consent_given boolean not null default true,
      ip_address inet null,
      user_agent text null,
      created_at timestamptz not null default now()
    );

    -- Prevent duplicates for same user/doc/version (treat NULL version as empty)
    CREATE UNIQUE INDEX user_consents_unique_idx
      ON public.user_consents(user_id, document_type, COALESCE(document_version, ''));

    CREATE INDEX user_consents_user_id_idx ON public.user_consents(user_id);
    CREATE INDEX user_consents_document_type_idx ON public.user_consents(document_type);
  END IF;
END$$;

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- Only the logged-in user can insert/select their own consents.
DROP POLICY IF EXISTS "user_consents_select_own" ON public.user_consents;
CREATE POLICY "user_consents_select_own"
ON public.user_consents
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_consents_insert_own" ON public.user_consents;
CREATE POLICY "user_consents_insert_own"
ON public.user_consents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Tighten default privileges (grants are still required for PostgREST)
REVOKE ALL ON TABLE public.user_consents FROM anon;
GRANT SELECT, INSERT ON TABLE public.user_consents TO authenticated;
