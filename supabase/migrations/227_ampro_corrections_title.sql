-- Add optional title to corrections so admins can label each correction.

DO $$
BEGIN
  IF to_regclass('public.ampro_corrections') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ampro_corrections'
        AND column_name = 'title'
    ) THEN
      ALTER TABLE public.ampro_corrections
        ADD COLUMN title text;
    END IF;
  END IF;
END $$;
