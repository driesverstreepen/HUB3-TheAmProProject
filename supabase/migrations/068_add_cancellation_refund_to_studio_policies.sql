-- 068_add_cancellation_refund_to_studio_policies.sql
-- Add cancellation/refund fields to studio_policies

-- 1) Add columns idempotently
ALTER TABLE IF EXISTS public.studio_policies
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT,
  ADD COLUMN IF NOT EXISTS refund_policy TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS cancellation_window_group_value INTEGER,
  ADD COLUMN IF NOT EXISTS cancellation_window_group_unit TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_window_workshop_value INTEGER,
  ADD COLUMN IF NOT EXISTS cancellation_window_workshop_unit TEXT;

-- 2) Create an index on cancellation_period_days for quick lookups (if needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_studio_policies_cancellation_period' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_studio_policies_cancellation_period ON public.studio_policies (cancellation_period_days);
  END IF;
END$$;

-- 3) Keep existing RLS policies: studio_admins already have FOR ALL access on studio_policies
-- No changes to RLS required here; columns are nullable and backward-compatible.

COMMENT ON TABLE public.studio_policies IS 'Per-studio policy documents (terms, cancellation policy, privacy, refund policy, etc.)';
