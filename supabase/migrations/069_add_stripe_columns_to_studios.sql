-- 069_add_stripe_columns_to_studios.sql
-- Idempotent migration to add Stripe-related columns to the studios table

ALTER TABLE IF EXISTS public.studios
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_account_type text,
  ADD COLUMN IF NOT EXISTS stripe_onboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_account_data jsonb,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_studios_stripe_account_id
  ON public.studios (stripe_account_id);

COMMENT ON COLUMN public.studios.stripe_account_id IS 'Stripe account id (connect) for this studio';
COMMENT ON COLUMN public.studios.stripe_account_type IS 'Optional account type (express/standard)';
COMMENT ON COLUMN public.studios.stripe_account_data IS 'JSON blob with Stripe account metadata (cached)';
