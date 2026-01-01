-- 086_add_agreed_to_studio_policies_to_inschrijvingen.sql
-- Add explicit agreed_to_studio_policies flag to inschrijvingen so we can query/store consent easily

ALTER TABLE IF EXISTS public.inschrijvingen
  ADD COLUMN IF NOT EXISTS agreed_to_studio_policies BOOLEAN DEFAULT false;

-- Optional: index for quick lookup
CREATE INDEX IF NOT EXISTS idx_inschrijvingen_agreed_to_policies ON public.inschrijvingen(agreed_to_studio_policies) WHERE agreed_to_studio_policies = true;
