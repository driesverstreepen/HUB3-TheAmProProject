-- 003_rename_phone_drop_display_name.sql
-- Idempotent migration to rename `phone` -> `phone_number` and remove `display_name` if desired.
-- Safe to run multiple times.

-- 1) Add the new column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN phone_number TEXT;
  END IF;
END$$;

-- 2) Backfill phone_number from existing phone values (only when phone_number is null)
UPDATE public.user_profiles
SET phone_number = phone
WHERE phone_number IS NULL
  AND phone IS NOT NULL;

-- 3) Drop the old `phone` column if it exists
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS phone;

-- 4) Optionally drop `display_name` if it exists (this removes any nickname/display field)
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS display_name;

-- End of migration
