-- Migration 101: App feedback (anonymous submissions)
--
-- Allows authenticated users to submit feedback with an optional location.
-- Stores whether feedback came from the user or studio interface.
-- Super admins can review and mark feedback as resolved.

CREATE TABLE IF NOT EXISTS public.app_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interface text NOT NULL CHECK (interface IN ('user', 'studio')),
  studio_id uuid NULL REFERENCES public.studios(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(trim(title)) > 0),
  description text NOT NULL CHECK (char_length(trim(description)) > 0),
  location text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz NULL,
  resolved_by uuid NULL
);

CREATE INDEX IF NOT EXISTS idx_app_feedback_created_at ON public.app_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_feedback_is_resolved ON public.app_feedback(is_resolved);

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

-- Authenticated users can submit feedback (anonymous: we don't store user_id)
DROP POLICY IF EXISTS app_feedback_insert_authenticated ON public.app_feedback;
CREATE POLICY app_feedback_insert_authenticated
  ON public.app_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only super_admin can read and update feedback
DROP POLICY IF EXISTS app_feedback_select_super_admin ON public.app_feedback;
CREATE POLICY app_feedback_select_super_admin
  ON public.app_feedback
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS app_feedback_update_super_admin ON public.app_feedback;
CREATE POLICY app_feedback_update_super_admin
  ON public.app_feedback
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
  );
