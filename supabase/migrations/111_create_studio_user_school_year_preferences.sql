-- Migration 111: Persist per-user selected school year per studio
-- Allows remembering a chosen school year without changing the studio-global active year.

BEGIN;

CREATE TABLE IF NOT EXISTS public.studio_user_school_year_preferences (
  studio_id uuid NOT NULL,
  user_id uuid NOT NULL,
  selected_school_year_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (studio_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'studio_user_school_year_preferences_selected_school_year_id_fkey'
  ) THEN
    ALTER TABLE public.studio_user_school_year_preferences
      ADD CONSTRAINT studio_user_school_year_preferences_selected_school_year_id_fkey
      FOREIGN KEY (selected_school_year_id)
      REFERENCES public.studio_school_years(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.studio_user_school_year_preferences ENABLE ROW LEVEL SECURITY;

-- Allow read for the owning user, but only if they have access to the studio
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'studio_user_school_year_preferences_select_own'
      AND polrelid = 'public.studio_user_school_year_preferences'::regclass
  ) THEN
    EXECUTE $policy$
      CREATE POLICY studio_user_school_year_preferences_select_own
      ON public.studio_user_school_year_preferences
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid()
        AND (
          EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_id AND s.eigenaar_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.studio_members sm WHERE sm.studio_id = studio_id AND sm.user_id = auth.uid())
        )
      )
    $policy$;
  END IF;
END $$;



-- Allow upsert/insert for the owning user (same studio access check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'studio_user_school_year_preferences_insert_own'
      AND polrelid = 'public.studio_user_school_year_preferences'::regclass
  ) THEN
    EXECUTE $policy$
      CREATE POLICY studio_user_school_year_preferences_insert_own
      ON public.studio_user_school_year_preferences
      FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND (
          EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_id AND s.eigenaar_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.studio_members sm WHERE sm.studio_id = studio_id AND sm.user_id = auth.uid())
        )
      )
    $policy$;
  END IF;
END $$;

-- Allow update for the owning user (same studio access check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'studio_user_school_year_preferences_update_own'
      AND polrelid = 'public.studio_user_school_year_preferences'::regclass
  ) THEN
    EXECUTE $policy$
      CREATE POLICY studio_user_school_year_preferences_update_own
      ON public.studio_user_school_year_preferences
      FOR UPDATE
      TO authenticated
      USING (
        user_id = auth.uid()
        AND (
          EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_id AND s.eigenaar_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.studio_members sm WHERE sm.studio_id = studio_id AND sm.user_id = auth.uid())
        )
      )
      WITH CHECK (
        user_id = auth.uid()
        AND (
          EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_id AND s.eigenaar_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.studio_members sm WHERE sm.studio_id = studio_id AND sm.user_id = auth.uid())
        )
      )
    $policy$;
  END IF;
END $$;

COMMIT;
