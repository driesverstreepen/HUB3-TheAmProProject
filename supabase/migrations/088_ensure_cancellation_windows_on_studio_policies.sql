-- 088_ensure_cancellation_windows_on_studio_policies.sql
-- Ensure all cancellation window columns exist on studio_policies (idempotent)

ALTER TABLE IF EXISTS public.studio_policies
  ADD COLUMN IF NOT EXISTS cancellation_window_group_value INTEGER,
  ADD COLUMN IF NOT EXISTS cancellation_window_group_unit TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_window_workshop_value INTEGER,
  ADD COLUMN IF NOT EXISTS cancellation_window_workshop_unit TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_window_trial_value INTEGER,
  ADD COLUMN IF NOT EXISTS cancellation_window_trial_unit TEXT;

-- Optional index to speed queries that filter by cancellation_period_days (if used)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_studio_policies_cancellation_period' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_studio_policies_cancellation_period ON public.studio_policies (cancellation_period_days);
  END IF;
END$$;

COMMENT ON COLUMN public.studio_policies.cancellation_window_group_value IS 'Number of days/hours for group cancellation window (nullable)';
COMMENT ON COLUMN public.studio_policies.cancellation_window_group_unit IS 'Unit for group cancellation window: "days" or "hours" (nullable)';
COMMENT ON COLUMN public.studio_policies.cancellation_window_workshop_value IS 'Number of days/hours for workshop cancellation window (nullable)';
COMMENT ON COLUMN public.studio_policies.cancellation_window_workshop_unit IS 'Unit for workshop cancellation window: "days" or "hours" (nullable)';
COMMENT ON COLUMN public.studio_policies.cancellation_window_trial_value IS 'Number of days/hours for trial cancellation window (nullable)';
COMMENT ON COLUMN public.studio_policies.cancellation_window_trial_unit IS 'Unit for trial cancellation window: "days" or "hours" (nullable)';
