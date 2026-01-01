-- Add features JSONB column to studios to store toggles for optional features
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}'::jsonb;

-- Ensure index on features is available for potential queries
CREATE INDEX IF NOT EXISTS idx_studios_features ON public.studios USING gin (features);
