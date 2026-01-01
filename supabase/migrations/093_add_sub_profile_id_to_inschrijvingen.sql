-- 093_add_sub_profile_id_to_inschrijvingen.sql
-- Adds sub_profile_id to inschrijvingen to distinguish enrollments by dependent profiles

ALTER TABLE IF EXISTS public.inschrijvingen
  ADD COLUMN IF NOT EXISTS sub_profile_id UUID REFERENCES public.sub_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inschrijvingen_sub_profile_id ON public.inschrijvingen(sub_profile_id);

-- Duplicate prevention uniqueness (optional future): could consider a partial unique index combining user_id/program_id/lesson_id/sub_profile_id
-- For now we keep logic in application layer due to existing data.
