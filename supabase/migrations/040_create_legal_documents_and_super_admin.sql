-- Migration 040: Legal Documents and Super Admin
-- Creates tables for privacy policy, terms of service, user consents, and super admin role

-- =====================================================
-- 1. Legal Documents Table
-- =====================================================

-- Drop existing table if it exists (to ensure clean slate)
DROP TABLE IF EXISTS public.legal_documents CASCADE;

CREATE TABLE public.legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL CHECK (document_type IN ('privacy_policy', 'terms_of_service')),
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(document_type, version)
);

-- Index for quick lookup of active documents
CREATE INDEX idx_legal_documents_active ON public.legal_documents(document_type, is_active) WHERE is_active = true;

-- =====================================================
-- 2. User Consents Table
-- =====================================================

-- Drop existing table if it exists
DROP TABLE IF EXISTS public.user_consents CASCADE;

CREATE TABLE public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('privacy_policy', 'terms_of_service')),
  document_version INTEGER NOT NULL,
  consent_given BOOLEAN NOT NULL DEFAULT true,
  consent_date TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  UNIQUE(user_id, document_type, document_version)
);

-- Index for checking user consents
CREATE INDEX idx_user_consents_user ON public.user_consents(user_id);
CREATE INDEX idx_user_consents_document ON public.user_consents(document_type, document_version);

-- =====================================================
-- 3. Add Super Admin Role Support
-- =====================================================
-- Super admin role is added to user_roles table which already exists
-- We just need to ensure the role enum supports it
-- This will be handled in application logic

-- =====================================================
-- 4. RLS Policies for Legal Documents
-- =====================================================

-- Enable RLS
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- Legal Documents Policies
-- Anyone can read active legal documents (needed for public pages)
CREATE POLICY "legal_documents_public_read"
  ON public.legal_documents
  FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

-- Only super admins can create/update legal documents
CREATE POLICY "legal_documents_super_admin_all"
  ON public.legal_documents
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- User Consents Policies
-- Users can read their own consents
CREATE POLICY "user_consents_own_read"
  ON public.user_consents
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own consents (during registration)
CREATE POLICY "user_consents_own_insert"
  ON public.user_consents
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Super admins can read all consents (for audit purposes)
CREATE POLICY "user_consents_super_admin_read"
  ON public.user_consents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- =====================================================
-- 5. Insert Default Legal Documents (Placeholders)
-- =====================================================
INSERT INTO public.legal_documents (document_type, version, content, effective_date, is_active)
VALUES 
  (
    'privacy_policy',
    1,
    '# Privacybeleid

## 1. Inleiding
Dit is een placeholder voor het privacybeleid. Dit moet worden ingevuld door de super admin.

## 2. Gegevensverzameling
Wij verzamelen de volgende gegevens...

## 3. Gebruik van gegevens
Uw gegevens worden gebruikt voor...

## 4. Beveiliging
Wij nemen de volgende maatregelen om uw gegevens te beveiligen...

## 5. Uw rechten
U heeft het recht om...

## 6. Contact
Voor vragen over dit privacybeleid, neem contact op met...',
    NOW(),
    true
  ),
  (
    'terms_of_service',
    1,
    '# Algemene Voorwaarden

## 1. Toepasselijkheid
Deze algemene voorwaarden zijn van toepassing op...

## 2. Diensten
Wij bieden de volgende diensten aan...

## 3. Gebruikersverplichtingen
Als gebruiker bent u verplicht om...

## 4. Aansprakelijkheid
Onze aansprakelijkheid is beperkt tot...

## 5. Wijzigingen
Wij behouden ons het recht voor om...

## 6. Geschillen
In geval van geschillen is het Nederlandse recht van toepassing...',
    NOW(),
    true
  );

-- =====================================================
-- 6. Function to check if user has given all required consents
-- =====================================================
CREATE OR REPLACE FUNCTION check_user_consents(p_user_id UUID)
RETURNS TABLE(has_all_consents BOOLEAN, missing_documents TEXT[]) AS $$
DECLARE
  v_required_docs TEXT[] := ARRAY['privacy_policy', 'terms_of_service'];
  v_missing TEXT[];
BEGIN
  -- Get list of document types user hasn't consented to
  SELECT ARRAY_AGG(doc_type)
  INTO v_missing
  FROM UNNEST(v_required_docs) AS doc_type
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_consents uc
    JOIN public.legal_documents ld ON ld.document_type = uc.document_type 
      AND ld.version = uc.document_version
    WHERE uc.user_id = p_user_id
      AND uc.document_type = doc_type
      AND ld.is_active = true
      AND uc.consent_given = true
  );

  -- Return result
  RETURN QUERY
  SELECT 
    (v_missing IS NULL OR array_length(v_missing, 1) IS NULL) as has_all_consents,
    COALESCE(v_missing, ARRAY[]::TEXT[]) as missing_documents;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON TABLE public.legal_documents IS 'Stores privacy policy and terms of service with versioning';
COMMENT ON TABLE public.user_consents IS 'Tracks user consent for legal documents (GDPR compliance)';
COMMENT ON FUNCTION check_user_consents IS 'Checks if user has consented to all required legal documents';
