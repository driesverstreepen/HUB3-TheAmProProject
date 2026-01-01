-- Migration: Allow public SELECT on locations
-- Locations are non-sensitive and should be visible to all users, teachers and anonymous visitors.

BEGIN;

-- Remove any existing restrictive SELECT policy (if present)
DROP POLICY IF EXISTS "Studio admins can view their studio's locations" ON public.locations;
DROP POLICY IF EXISTS "Studio admins can view their studio's locations" ON public.locations;

-- Allow public SELECT on locations
CREATE POLICY "Public can view locations"
  ON public.locations
  FOR SELECT
  USING (true);

COMMIT;
