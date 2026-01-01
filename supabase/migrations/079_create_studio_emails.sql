-- Create table for studio emails (compose/drafts/templates/history)
CREATE TABLE IF NOT EXISTS public.studio_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','template','sent')),
  recipient_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipient_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_studio_emails_updated_at ON public.studio_emails;
CREATE TRIGGER trg_studio_emails_updated_at
BEFORE UPDATE ON public.studio_emails
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.studio_emails ENABLE ROW LEVEL SECURITY;

-- Policy: studio admins (owner/admin) can manage emails for their studio
CREATE POLICY "Studio admins manage emails"
ON public.studio_emails
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'studio_admin'
      AND ur.studio_id = studio_emails.studio_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'studio_admin'
      AND ur.studio_id = studio_emails.studio_id
  )
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_studio_emails_studio ON public.studio_emails(studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_emails_status ON public.studio_emails(status);
CREATE INDEX IF NOT EXISTS idx_studio_emails_sent_at ON public.studio_emails(sent_at);
