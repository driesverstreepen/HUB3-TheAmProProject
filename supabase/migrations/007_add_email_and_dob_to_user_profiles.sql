-- 007_add_email_and_dob_to_user_profiles.sql
-- Add email and date_of_birth columns to user_profiles so the application can store these values.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN email TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'date_of_birth'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN date_of_birth DATE;
  END IF;
END$$;

-- End of migration
