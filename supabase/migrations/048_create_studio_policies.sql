-- Migration 048: Create studio_policies table
-- Stores per-studio policy documents (terms, cancellation, privacy, etc.)

DROP TABLE IF EXISTS studio_policies CASCADE;

CREATE TABLE studio_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_studio_policies_active ON studio_policies(studio_id, is_active) WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE studio_policies ENABLE ROW LEVEL SECURITY;

-- Public read for active policies (preview pages should be accessible anonymously)
CREATE POLICY "studio_policies_public_read"
  ON studio_policies
  FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

-- Allow studio admins (user_roles.role = 'studio_admin' and matching studio_id) full access
CREATE POLICY "studio_policies_studio_admin_all"
  ON studio_policies
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = studio_policies.studio_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = studio_policies.studio_id
    )
  );

COMMENT ON TABLE studio_policies IS 'Per-studio policy documents (terms, cancellation policy, privacy, etc.)';
