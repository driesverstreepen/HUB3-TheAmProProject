-- Migration 096: Per-program evaluation settings + add percent method

BEGIN;

-- Ensure studio_evaluation_settings has extended config fields (idempotent)
DO $$
BEGIN
  IF to_regclass('public.studio_evaluation_settings') IS NOT NULL THEN
    ALTER TABLE public.studio_evaluation_settings
      ADD COLUMN IF NOT EXISTS method text DEFAULT 'score',
      ADD COLUMN IF NOT EXISTS categories jsonb DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS rating_scale jsonb DEFAULT '["onvoldoende","kan beter"voldoende","goed","zeer goed","uitstekend"]',
      ADD COLUMN IF NOT EXISTS periods jsonb DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS default_visible_from date NULL;

    -- Expand method constraint to include percent
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'studio_evaluation_settings_method_check'
        AND conrelid = 'public.studio_evaluation_settings'::regclass
    ) THEN
      ALTER TABLE public.studio_evaluation_settings DROP CONSTRAINT studio_evaluation_settings_method_check;
    END IF;

    ALTER TABLE public.studio_evaluation_settings
      ADD CONSTRAINT studio_evaluation_settings_method_check
      CHECK (method IN ('score','percent','rating','feedback'));
  END IF;
END$$;

-- Per-program settings table
CREATE TABLE IF NOT EXISTS public.program_evaluation_settings (
  program_id uuid PRIMARY KEY REFERENCES public.programs(id) ON DELETE CASCADE,
  enabled boolean DEFAULT false,
  default_visibility text DEFAULT 'hidden' CHECK (default_visibility IN ('hidden', 'visible_immediate', 'visible_on_date')),
  default_visible_from date NULL,
  editable_after_publish_days integer DEFAULT 7,
  allow_teachers_edit boolean DEFAULT true,
  method text DEFAULT 'score' CHECK (method IN ('score','percent','rating','feedback')),
  categories jsonb DEFAULT '[]',
  rating_scale jsonb DEFAULT '["voldoende","goed","zeer goed","uitstekend"]',
  periods jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_program_evaluation_settings_program_id ON public.program_evaluation_settings(program_id);

ALTER TABLE public.program_evaluation_settings ENABLE ROW LEVEL SECURITY;

-- Only studio admins can manage per-program evaluation settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'program_eval_settings_admin'
      AND polrelid = 'public.program_evaluation_settings'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY program_eval_settings_admin ON public.program_evaluation_settings
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.programs p
          JOIN public.user_roles ur ON ur.studio_id = p.studio_id
          WHERE p.id = program_evaluation_settings.program_id
            AND ur.user_id = auth.uid()
            AND ur.role IN (''studio_admin'',''admin'')
        )
      )';
  END IF;
END$$;

-- Evaluations: widen score range to support percent and store score_max
DO $$
BEGIN
  IF to_regclass('public.evaluations') IS NOT NULL THEN
    -- Add score_max column
    ALTER TABLE public.evaluations
      ADD COLUMN IF NOT EXISTS score_max integer;

    -- Drop old score check if present (name from table definition is usually evaluations_score_check)
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'evaluations_score_check'
        AND conrelid = 'public.evaluations'::regclass
    ) THEN
      ALTER TABLE public.evaluations DROP CONSTRAINT evaluations_score_check;
    END IF;

    -- Change score to numeric so we can store halves for /10 and ints for %
    -- If it's already numeric, this is a no-op.
    BEGIN
      ALTER TABLE public.evaluations
        ALTER COLUMN score TYPE numeric
        USING score::numeric;
    EXCEPTION WHEN others THEN
      -- ignore if type cast fails or already compatible
      NULL;
    END;

    -- New constraint: allow 0..100 when score is present
    ALTER TABLE public.evaluations
      ADD CONSTRAINT evaluations_score_check
      CHECK (score IS NULL OR (score >= 0 AND score <= 100));
  END IF;
END$$;

-- Backfill: if a studio has settings, create per-program rows inheriting studio defaults
DO $$
BEGIN
  IF to_regclass('public.programs') IS NOT NULL AND to_regclass('public.program_evaluation_settings') IS NOT NULL THEN
    INSERT INTO public.program_evaluation_settings (
      program_id,
      enabled,
      default_visibility,
      default_visible_from,
      editable_after_publish_days,
      allow_teachers_edit,
      method,
      categories,
      rating_scale,
      periods,
      created_at,
      updated_at
    )
    SELECT
      p.id,
      false,
      COALESCE(s.default_visibility, 'hidden'),
      s.default_visible_from,
      COALESCE(s.editable_after_publish_days, 7),
      COALESCE(s.allow_teachers_edit, true),
      COALESCE(s.method, 'score'),
      COALESCE(s.categories, '[]'::jsonb),
      COALESCE(s.rating_scale, '["voldoende","goed","zeer goed","uitstekend"]'::jsonb),
      COALESCE(s.periods, '[]'::jsonb),
      now(),
      now()
    FROM public.programs p
    LEFT JOIN public.studio_evaluation_settings s ON s.studio_id = p.studio_id
    ON CONFLICT (program_id) DO NOTHING;
  END IF;
END$$;

COMMIT;
