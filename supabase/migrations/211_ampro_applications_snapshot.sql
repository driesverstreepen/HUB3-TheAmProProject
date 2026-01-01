-- AmPro: store user profile snapshot on application submit

ALTER TABLE public.ampro_applications
  ADD COLUMN IF NOT EXISTS snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb;
