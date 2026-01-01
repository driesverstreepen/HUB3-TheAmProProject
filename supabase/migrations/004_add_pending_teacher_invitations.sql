-- Migration: Add pending teacher invitations
-- Created: 2025-10-31

-- Create table for pending teacher invitations (emails that don't have accounts yet)
CREATE TABLE IF NOT EXISTS public.pending_teacher_invitations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL,
  studio_id uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  invited_at timestamp with time zone DEFAULT now(),
  invited_by uuid REFERENCES auth.users(id), -- admin who invited
  UNIQUE(email, studio_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pending_teacher_invitations_email ON public.pending_teacher_invitations(email);
CREATE INDEX IF NOT EXISTS idx_pending_teacher_invitations_studio ON public.pending_teacher_invitations(studio_id);

-- Comment for documentation
COMMENT ON TABLE public.pending_teacher_invitations IS 'Pending teacher invitations for emails that don''t have accounts yet';