-- Add default_visible_from to studio_evaluation_settings for date-based default visibility
BEGIN;

ALTER TABLE studio_evaluation_settings
  ADD COLUMN IF NOT EXISTS default_visible_from date NULL;

COMMIT;