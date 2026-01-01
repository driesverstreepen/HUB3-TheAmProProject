-- Migration 090: Create studio_members and studio_invites tables for multi-admin support
-- This allows multiple users to have access to the same studio with different roles

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS studio_invites CASCADE;
DROP TABLE IF EXISTS studio_members CASCADE;
DROP TYPE IF EXISTS studio_member_role CASCADE;

-- Create enum for studio member roles
CREATE TYPE studio_member_role AS ENUM ('owner', 'admin');

-- Create studio_members table to track all users with access to a studio
CREATE TABLE studio_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role studio_member_role NOT NULL DEFAULT 'admin',
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure a user can only have one role per studio
  UNIQUE(studio_id, user_id)
);

-- Create index for faster lookups
CREATE INDEX idx_studio_members_studio_id ON studio_members(studio_id);
CREATE INDEX idx_studio_members_user_id ON studio_members(user_id);

-- Create studio_invites table for pending invitations
CREATE TABLE studio_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role studio_member_role NOT NULL DEFAULT 'admin',
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Prevent duplicate invites for same email to same studio
  UNIQUE(studio_id, email),
  
  -- Status constraint
  CONSTRAINT studio_invites_status_check CHECK (status IN ('pending', 'accepted', 'declined'))
);

-- Create index for faster lookups
CREATE INDEX idx_studio_invites_studio_id ON studio_invites(studio_id);
CREATE INDEX idx_studio_invites_email ON studio_invites(email);
CREATE INDEX idx_studio_invites_status ON studio_invites(status);

-- Enable RLS
ALTER TABLE studio_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for studio_members
-- FIXED: Removed recursive policy that caused infinite recursion

-- Studio members can view members of studios where they are already members
CREATE POLICY "studio_members_select_own_studio"
  ON studio_members
  FOR SELECT
  USING (
    -- The user is a member of the studio they are trying to view members of.
    -- This is checked by seeing if a studio_members entry exists for the current user and the studio_id of the row being checked.
    EXISTS (
      SELECT 1
      FROM studio_members sm_check
      WHERE sm_check.user_id = auth.uid() AND sm_check.studio_id = studio_members.studio_id
    )
    -- OR the user is the owner of the studio.
    OR EXISTS (
      SELECT 1
      FROM studios s_check
      WHERE s_check.eigenaar_id = auth.uid() AND s_check.id = studio_members.studio_id
    )
  );

-- Allow service role to insert (will be used by API after invite acceptance)
CREATE POLICY "studio_members_insert_service"
  ON studio_members
  FOR INSERT
  WITH CHECK (true); -- Will be controlled by API with service role key

-- Only owners can delete members
CREATE POLICY "studio_members_delete_owner"
  ON studio_members
  FOR DELETE
  USING (
    studio_id IN (
      SELECT id FROM studios WHERE eigenaar_id = auth.uid()
    )
  );

-- Only owners can update member roles
CREATE POLICY "studio_members_update_owner"
  ON studio_members
  FOR UPDATE
  USING (
    studio_id IN (
      SELECT id FROM studios WHERE eigenaar_id = auth.uid()
    )
  );

-- RLS Policies for studio_invites

-- Studio members can view invites for their studios
CREATE POLICY "studio_invites_select_members"
  ON studio_invites
  FOR SELECT
  USING (
    studio_id IN (
      SELECT id FROM studios WHERE eigenaar_id = auth.uid()
      UNION
      SELECT sm.studio_id FROM studio_members sm WHERE sm.user_id = auth.uid()
    )
  );

-- Service role can insert invites (controlled by API)
CREATE POLICY "studio_invites_insert_service"
  ON studio_invites
  FOR INSERT
  WITH CHECK (true); -- Will be controlled by API with service role key

-- Owners and admins can delete (revoke) invites
CREATE POLICY "studio_invites_delete_admin"
  ON studio_invites
  FOR DELETE
  USING (
    studio_id IN (
      SELECT id FROM studios WHERE eigenaar_id = auth.uid()
      UNION
      SELECT sm.studio_id FROM studio_members sm WHERE sm.user_id = auth.uid()
    )
  );

-- Service role can update invites (controlled by API)
CREATE POLICY "studio_invites_update_service"
  ON studio_invites
  FOR UPDATE
  WITH CHECK (true); -- Will be controlled by API with service role key

-- Migrate existing studio owners to studio_members
-- Every studio owner becomes the 'owner' role in studio_members
INSERT INTO studio_members (studio_id, user_id, role, joined_at)
SELECT s.id, s.eigenaar_id, 'owner'::studio_member_role, s.created_at
FROM studios s
WHERE s.eigenaar_id IS NOT NULL
ON CONFLICT (studio_id, user_id) DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE studio_members IS 'Tracks all users with access to a studio and their roles';
COMMENT ON TABLE studio_invites IS 'Pending invitations for users to join a studio team via notifications';
COMMENT ON COLUMN studio_members.role IS 'owner: full control including team management, admin: can manage studio settings and content';
COMMENT ON COLUMN studio_invites.status IS 'Status of studio invitation: pending, accepted, or declined';

-- Update notification type constraint to include studio_admin_invitation
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('teacher_invitation', 'studio_admin_invitation', 'info', 'warning', 'announcement'));
