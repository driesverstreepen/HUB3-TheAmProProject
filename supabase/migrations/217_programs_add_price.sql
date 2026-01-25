-- Migration: add price column to ampro_programmas
-- Adds `price` integer column storing amount in cents (e.g. 1000 = 10.00 EUR).
-- Stripe tables have been removed; keep price on program row for admin-provided pricing.

BEGIN;

ALTER TABLE public.ampro_programmas
  ADD COLUMN IF NOT EXISTS price integer;

COMMENT ON COLUMN public.ampro_programmas.price IS
  'Price in cents (integer). NULL when no price set. Previously stored on stripe_products.price_amount.';

COMMIT;
