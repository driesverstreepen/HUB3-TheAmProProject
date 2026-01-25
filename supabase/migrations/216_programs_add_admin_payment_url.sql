-- Migration 216: Add admin_payment_url to programs
ALTER TABLE public.ampro_programmas
  ADD COLUMN IF NOT EXISTS admin_payment_url TEXT;

-- No default; nullable by design. Backfill is not performed here.
