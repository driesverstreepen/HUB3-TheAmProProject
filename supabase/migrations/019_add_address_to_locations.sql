-- Add 'adres' and 'postcode' to locations and backfill from existing 'city' where appropriate
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS adres TEXT;

-- Backfill adres from existing city column for legacy data (best-effort)
UPDATE public.locations
SET adres = city
WHERE adres IS NULL AND city IS NOT NULL;

-- Update updated_at timestamp for migrated rows
UPDATE public.locations
SET updated_at = NOW()
WHERE adres IS NOT NULL AND updated_at < NOW() - INTERVAL '1 second';

-- Note: this migration keeps the legacy 'city' column for backward compatibility.
-- Consider removing 'city' in a future migration after updating clients and data.
