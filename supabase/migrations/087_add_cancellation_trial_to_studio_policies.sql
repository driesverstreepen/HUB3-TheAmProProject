-- 087_add_cancellation_trial_to_studio_policies.sql
-- Add trial cancellation window fields to studio_policies (idempotent)

ALTER TABLE IF EXISTS public.studio_policies
  ADD COLUMN IF NOT EXISTS cancellation_window_trial_value INTEGER,
  ADD COLUMN IF NOT EXISTS cancellation_window_trial_unit TEXT;

-- No additional RLS changes required; columns are nullable and backward-compatible.

COMMENT ON COLUMN public.studio_policies.cancellation_window_trial_value IS 'Number of days/hours for trial cancellation window (nullable)';
COMMENT ON COLUMN public.studio_policies.cancellation_window_trial_unit IS 'Unit for trial cancellation window: "days" or "hours" (nullable)';
