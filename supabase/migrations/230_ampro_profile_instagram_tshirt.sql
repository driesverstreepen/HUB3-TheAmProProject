-- AmPro: add instagram username + t-shirt size to dancer profiles

ALTER TABLE public.ampro_dancer_profiles
  ADD COLUMN IF NOT EXISTS instagram_username text,
  ADD COLUMN IF NOT EXISTS tshirt_size text;

-- Optional: constrain tshirt_size to known values (best-effort, non-breaking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ampro_dancer_profiles_tshirt_size_check'
  ) THEN
    ALTER TABLE public.ampro_dancer_profiles
      ADD CONSTRAINT ampro_dancer_profiles_tshirt_size_check
      CHECK (tshirt_size IS NULL OR tshirt_size IN ('XS','S','M','L','XL','XXL'));
  END IF;
END $$;
