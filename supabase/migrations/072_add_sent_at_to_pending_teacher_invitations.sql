-- Migration: Add sent_at column to pending_teacher_invitations
-- This stores when a notification was created/sent for the invitation

BEGIN;

ALTER TABLE public.pending_teacher_invitations
  ADD COLUMN IF NOT EXISTS sent_at timestamptz NULL;

COMMIT;

-- End migration
