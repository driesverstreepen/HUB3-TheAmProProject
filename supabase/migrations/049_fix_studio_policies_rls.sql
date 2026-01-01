-- Migration 049: Fix studio_policies RLS to allow studio_admin inserts
-- The original policy uses the same condition for USING and WITH CHECK,
-- but WITH CHECK is evaluated AFTER the row is inserted, so we need to ensure
-- the policy allows the insert to happen.

-- Drop the existing policy
DROP POLICY IF EXISTS "studio_policies_studio_admin_all" ON studio_policies;

-- Create separate policies for different operations to be more explicit
-- Policy for SELECT (studio admins can read their own policies)
CREATE POLICY "studio_policies_studio_admin_select"
  ON studio_policies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = studio_policies.studio_id
    )
  );

-- Policy for INSERT (studio admins can create policies for their studio)
CREATE POLICY "studio_policies_studio_admin_insert"
  ON studio_policies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = studio_policies.studio_id
    )
  );

-- Policy for UPDATE (studio admins can update their own policies)
CREATE POLICY "studio_policies_studio_admin_update"
  ON studio_policies
  FOR UPDATE
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

-- Policy for DELETE (studio admins can delete their own policies)
CREATE POLICY "studio_policies_studio_admin_delete"
  ON studio_policies
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'studio_admin'
        AND user_roles.studio_id = studio_policies.studio_id
    )
  );

COMMENT ON POLICY "studio_policies_studio_admin_select" ON studio_policies IS 'Studio admins can view their studio policies';
COMMENT ON POLICY "studio_policies_studio_admin_insert" ON studio_policies IS 'Studio admins can create policies for their studio';
COMMENT ON POLICY "studio_policies_studio_admin_update" ON studio_policies IS 'Studio admins can update their studio policies';
COMMENT ON POLICY "studio_policies_studio_admin_delete" ON studio_policies IS 'Studio admins can delete their studio policies';
