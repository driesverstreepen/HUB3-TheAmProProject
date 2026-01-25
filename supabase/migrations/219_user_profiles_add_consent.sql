-- Migration 219: Add GDPR consent fields to ampro_dancer_profiles
-- Adds: consent_given (boolean), consent_given_at (timestamptz), consent_text_version (text)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ampro_dancer_profiles' AND column_name = 'consent_given'
  ) THEN
    ALTER TABLE public.ampro_dancer_profiles ADD COLUMN consent_given BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ampro_dancer_profiles' AND column_name = 'consent_given_at'
  ) THEN
    ALTER TABLE public.ampro_dancer_profiles ADD COLUMN consent_given_at TIMESTAMPTZ NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ampro_dancer_profiles' AND column_name = 'consent_text_version'
  ) THEN
    ALTER TABLE public.ampro_dancer_profiles ADD COLUMN consent_text_version TEXT NULL;
  END IF;
END$$;

