-- Migration: Create notifications system
-- Created: 2025-10-31

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'teacher_invitation', 'info', 'warning', etc.
  title text NOT NULL,
  message text NOT NULL,
  action_type text, -- 'teacher_invitation_accept_decline', null for info notifications
  action_data jsonb, -- stores invitation_id, studio_id, etc.
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  CONSTRAINT notifications_type_check CHECK (type IN ('teacher_invitation', 'info', 'warning', 'announcement'))
);

-- Add status to pending_teacher_invitations
ALTER TABLE public.pending_teacher_invitations 
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responded_at timestamp with time zone,
  ADD CONSTRAINT pending_teacher_invitations_status_check CHECK (status IN ('pending', 'accepted', 'declined'));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_teacher_invitations_status ON public.pending_teacher_invitations(status);

-- Comments for documentation
COMMENT ON TABLE public.notifications IS 'System notifications for users including teacher invitations';
COMMENT ON COLUMN public.notifications.action_type IS 'Type of action user can take on this notification';
COMMENT ON COLUMN public.notifications.action_data IS 'JSON data needed to perform the action';
COMMENT ON COLUMN public.pending_teacher_invitations.status IS 'Status of teacher invitation: pending, accepted, or declined';
