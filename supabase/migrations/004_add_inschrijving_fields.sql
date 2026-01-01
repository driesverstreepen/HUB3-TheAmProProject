-- Add JSONB columns to inschrijvingen for storing form submissions and profile snapshots
ALTER TABLE public.inschrijvingen
  ADD COLUMN IF NOT EXISTS form_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_snapshot JSONB DEFAULT '{}'::jsonb;

-- Optional index for queries on nested form fields (if needed later)
CREATE INDEX IF NOT EXISTS idx_inschrijvingen_form_data ON public.inschrijvingen USING gin (form_data);
