-- Add hidden toggle for feature flags (hide completely vs show coming-soon)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'global_feature_flags'
      AND column_name = 'hidden'
  ) THEN
    ALTER TABLE public.global_feature_flags
      ADD COLUMN hidden boolean NOT NULL DEFAULT false;

    -- Backfill existing rows explicitly (defensive)
    UPDATE public.global_feature_flags
      SET hidden = false
      WHERE hidden IS NULL;
  END IF;
END $$;
