-- Migration 350: Make stripe_products.studio_id nullable
-- Create a backup of the table and then alter the column to DROP NOT NULL.

BEGIN;

-- Backup current table (only the columns we care about)
CREATE TABLE IF NOT EXISTS public.stripe_products_backup AS
SELECT * FROM public.stripe_products;

-- Make studio_id nullable so platform-only installations can store products
ALTER TABLE public.stripe_products
  ALTER COLUMN studio_id DROP NOT NULL;

COMMIT;
