-- Migration: add payment status fields to ampro_applications
-- Adds `paid` boolean and `payment_received_at` timestamptz so the app
-- can persist whether an application has been paid and when.

BEGIN;

ALTER TABLE public.ampro_applications
  ADD COLUMN IF NOT EXISTS paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_received_at timestamptz;

COMMENT ON COLUMN public.ampro_applications.paid IS
  'Whether the application has been paid (true/false). Default false.';

COMMENT ON COLUMN public.ampro_applications.payment_received_at IS
  'Timestamp when payment was received (nullable).';

COMMIT;
