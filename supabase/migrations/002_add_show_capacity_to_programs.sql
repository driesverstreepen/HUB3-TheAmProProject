-- Add a toggle so each program can control whether capacity is visible to visitors/users
-- This is useful because some programs (popular classes, workshops) may want to show capacity
-- while others prefer to hide it. Default is true (show capacity).
ALTER TABLE IF EXISTS public.programs
ADD COLUMN IF NOT EXISTS show_capacity_to_users boolean DEFAULT true;

-- Backfill: ensure existing programs have value true (default)
UPDATE public.programs SET show_capacity_to_users = true WHERE show_capacity_to_users IS NULL;
