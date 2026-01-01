-- Extend studio_evaluation_settings with evaluation configuration fields
-- Run this migration in Supabase or your database to enable advanced evaluation settings

ALTER TABLE studio_evaluation_settings
  ADD COLUMN IF NOT EXISTS method text DEFAULT 'score' CHECK (method IN ('score','rating','feedback')),
  ADD COLUMN IF NOT EXISTS categories jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS rating_scale jsonb DEFAULT '["voldoende","goed","zeer goed","uitstekend"]',
  ADD COLUMN IF NOT EXISTS periods jsonb DEFAULT '[]';
