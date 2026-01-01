-- Migration 082: create dance_styles table and seed canonical list

BEGIN;

CREATE TABLE IF NOT EXISTS public.dance_styles (
  id serial PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed canonical list (idempotent)
INSERT INTO public.dance_styles (name, slug)
VALUES
  ('Ballet', 'ballet'),
  ('Jazz', 'jazz'),
  ('Contemporary', 'contemporary'),
  ('Hip Hop', 'hip-hop'),
  ('Salsa', 'salsa'),
  ('Tango', 'tango'),
  ('Ballroom', 'ballroom'),
  ('Modern', 'modern'),
  ('K-pop', 'k-pop'),
  ('Urban', 'urban'),
  ('Flamenco', 'flamenco'),
  ('Tap', 'tap'),
  ('Street Dance', 'street-dance')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
