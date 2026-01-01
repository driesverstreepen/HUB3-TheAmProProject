-- AmPro: add required address fields to dancer profile

ALTER TABLE public.ampro_dancer_profiles
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS house_number text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text;
