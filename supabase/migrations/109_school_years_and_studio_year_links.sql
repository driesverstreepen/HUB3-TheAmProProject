-- Migration 109: School years for studios + link operational data to school year
-- Goal: studios work per school year (e.g. 2025-2026). A studio must have an active school year.

-- 1) Create studio_school_years
CREATE TABLE IF NOT EXISTS public.studio_school_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT studio_school_years_dates_check CHECK (ends_on >= starts_on)
);

-- Keep updated_at fresh (function may already exist; create or replace is safe)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_studio_school_years_updated_at ON public.studio_school_years;
CREATE TRIGGER trg_studio_school_years_updated_at
BEFORE UPDATE ON public.studio_school_years
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Ensure at most one active school year per studio
CREATE UNIQUE INDEX IF NOT EXISTS uniq_studio_school_years_one_active
  ON public.studio_school_years(studio_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_studio_school_years_studio ON public.studio_school_years(studio_id);

-- Enable RLS
ALTER TABLE public.studio_school_years ENABLE ROW LEVEL SECURITY;

-- Studio members can read school years
DROP POLICY IF EXISTS studio_school_years_select_members ON public.studio_school_years;
CREATE POLICY studio_school_years_select_members
  ON public.studio_school_years
  FOR SELECT
  TO authenticated
  USING (public.is_studio_member(studio_id));

-- Only owner/admin can manage (create/update/delete)
DROP POLICY IF EXISTS studio_school_years_insert_admins ON public.studio_school_years;
CREATE POLICY studio_school_years_insert_admins
  ON public.studio_school_years
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.studio_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.studio_id = studio_school_years.studio_id
        AND sm.role::text IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = studio_school_years.studio_id
        AND s.eigenaar_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS studio_school_years_update_admins ON public.studio_school_years;
CREATE POLICY studio_school_years_update_admins
  ON public.studio_school_years
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.studio_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.studio_id = studio_school_years.studio_id
        AND sm.role::text IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = studio_school_years.studio_id
        AND s.eigenaar_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.studio_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.studio_id = studio_school_years.studio_id
        AND sm.role::text IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = studio_school_years.studio_id
        AND s.eigenaar_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS studio_school_years_delete_admins ON public.studio_school_years;
CREATE POLICY studio_school_years_delete_admins
  ON public.studio_school_years
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.studio_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.studio_id = studio_school_years.studio_id
        AND sm.role::text IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.studios s
      WHERE s.id = studio_school_years.studio_id
        AND s.eigenaar_id = auth.uid()
    )
  );

-- 2) Create default active school year for existing studios without one
DO $$
DECLARE
  month_now int := extract(month from now());
  year_now int := extract(year from now());
  start_year int;
BEGIN
  start_year := CASE WHEN month_now >= 8 THEN year_now ELSE year_now - 1 END;

  INSERT INTO public.studio_school_years (studio_id, label, starts_on, ends_on, is_active)
  SELECT s.id,
         start_year::text || '-' || (start_year + 1)::text,
         make_date(start_year, 9, 1),
         make_date(start_year + 1, 8, 31),
         true
  FROM public.studios s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.studio_school_years sy WHERE sy.studio_id = s.id
  );
END $$;

-- 3) Add school_year_id columns + backfill + make NOT NULL
DO $$
BEGIN
  IF to_regclass('public.programs') IS NOT NULL THEN
    ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS school_year_id UUID;

    -- Backfill from active school year
    UPDATE public.programs p
    SET school_year_id = sy.id
    FROM public.studio_school_years sy
    WHERE sy.studio_id = p.studio_id
      AND sy.is_active = true
      AND p.school_year_id IS NULL;

    -- Add FK if missing
    BEGIN
      ALTER TABLE public.programs
        ADD CONSTRAINT programs_school_year_fk
        FOREIGN KEY (school_year_id)
        REFERENCES public.studio_school_years(id)
        ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;

    ALTER TABLE public.programs ALTER COLUMN school_year_id SET NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_programs_school_year ON public.programs(school_year_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.lessons') IS NOT NULL THEN
    ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS school_year_id UUID;

    -- Backfill via program
    UPDATE public.lessons l
    SET school_year_id = p.school_year_id
    FROM public.programs p
    WHERE p.id = l.program_id
      AND l.school_year_id IS NULL;

    BEGIN
      ALTER TABLE public.lessons
        ADD CONSTRAINT lessons_school_year_fk
        FOREIGN KEY (school_year_id)
        REFERENCES public.studio_school_years(id)
        ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;

    ALTER TABLE public.lessons ALTER COLUMN school_year_id SET NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_lessons_school_year ON public.lessons(school_year_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.inschrijvingen') IS NOT NULL THEN
    ALTER TABLE public.inschrijvingen ADD COLUMN IF NOT EXISTS school_year_id UUID;

    -- Backfill via program
    UPDATE public.inschrijvingen i
    SET school_year_id = p.school_year_id
    FROM public.programs p
    WHERE p.id = i.program_id
      AND i.school_year_id IS NULL;

    BEGIN
      ALTER TABLE public.inschrijvingen
        ADD CONSTRAINT inschrijvingen_school_year_fk
        FOREIGN KEY (school_year_id)
        REFERENCES public.studio_school_years(id)
        ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;

    ALTER TABLE public.inschrijvingen ALTER COLUMN school_year_id SET NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_inschrijvingen_school_year ON public.inschrijvingen(school_year_id);
  END IF;
END $$;
