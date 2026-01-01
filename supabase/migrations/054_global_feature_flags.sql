-- Global feature flags for phased rollout / coming-soon gating

CREATE TABLE IF NOT EXISTS public.global_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  coming_soon_label text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

ALTER TABLE public.global_feature_flags ENABLE ROW LEVEL SECURITY;

-- Public read is safe: these flags intentionally control UI visibility/availability.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'global_feature_flags'
      AND policyname = 'global_feature_flags_select_all'
  ) THEN
    CREATE POLICY global_feature_flags_select_all
      ON public.global_feature_flags
      FOR SELECT
      USING (true);
  END IF;
END $$;
