-- Migration 055: Add RLS policies for notifications and pending_teacher_invitations
-- Created: 2025-11-01
-- Purpose: Enable RLS and add policies so users can view their own notifications and studio admins can manage invitations

-- Enable RLS on notifications table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'notifications_view_own'
      AND polrelid = 'public.notifications'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY notifications_view_own ON public.notifications FOR SELECT USING (user_id = auth.uid());';
  END IF;
END$$;

-- Policy: Users can update (mark as read) their own notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'notifications_update_own'
      AND polrelid = 'public.notifications'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());';
  END IF;
END$$;

-- Policy: Users can delete their own notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'notifications_delete_own'
      AND polrelid = 'public.notifications'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE USING (user_id = auth.uid());';
  END IF;
END$$;

-- Policy: Service role bypass for notifications (for API routes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'notifications_service_role'
      AND polrelid = 'public.notifications'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY notifications_service_role ON public.notifications FOR ALL USING (true) WITH CHECK (true);';
  END IF;
END$$;

-- Enable RLS on pending_teacher_invitations table
ALTER TABLE public.pending_teacher_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Studio admins can manage invitations for their studio
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'pending_invitations_admin_manage'
      AND polrelid = 'public.pending_teacher_invitations'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY pending_invitations_admin_manage ON public.pending_teacher_invitations FOR ALL USING ( EXISTS ( SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ''studio_admin'' AND user_roles.studio_id = pending_teacher_invitations.studio_id ) );';
  END IF;
END$$;

-- Policy: Users can view invitations for their own email
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'pending_invitations_view_own'
      AND polrelid = 'public.pending_teacher_invitations'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY pending_invitations_view_own ON public.pending_teacher_invitations FOR SELECT USING ( email = (SELECT email FROM auth.users WHERE id = auth.uid()) );';
  END IF;
END$$;

-- Policy: Service role bypass for pending_teacher_invitations (for API routes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'pending_invitations_service_role'
      AND polrelid = 'public.pending_teacher_invitations'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY pending_invitations_service_role ON public.pending_teacher_invitations FOR ALL USING (true) WITH CHECK (true);';
  END IF;
END$$;

-- Comments for documentation
COMMENT ON POLICY notifications_view_own ON public.notifications IS 'Users can view their own notifications';
COMMENT ON POLICY notifications_update_own ON public.notifications IS 'Users can update (mark as read) their own notifications';
COMMENT ON POLICY notifications_delete_own ON public.notifications IS 'Users can delete their own notifications';
COMMENT ON POLICY pending_invitations_admin_manage ON public.pending_teacher_invitations IS 'Studio admins can manage invitations for their studio';
COMMENT ON POLICY pending_invitations_view_own ON public.pending_teacher_invitations IS 'Users can view invitations for their email address';
