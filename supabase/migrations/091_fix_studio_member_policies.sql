-- Migration 091: Replace recursive studio_members select policy with minimal non-recursive policy
-- and adjust invites select access pattern.

-- Drop old select policy if it exists
DROP POLICY IF EXISTS studio_members_select_own_studio ON studio_members;

-- Minimal SELECT policy: users see their own membership row, owners see all rows for their studios
CREATE POLICY studio_members_select_minimal
  ON studio_members
  FOR SELECT
  USING (
    user_id = auth.uid() OR studio_id IN (SELECT id FROM studios WHERE eigenaar_id = auth.uid())
  );

-- (Optional) You can later extend visibility via a service-role backed API endpoint.

-- Note: We keep other policies unchanged.
