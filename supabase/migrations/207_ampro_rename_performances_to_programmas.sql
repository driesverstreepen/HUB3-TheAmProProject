-- AmPro: rename performances table to a unified programs table
-- Goal: support future program types (performances, workshops, ...)

DO $$
BEGIN
  -- Only rename if the old table exists and the new one doesn't.
  IF to_regclass('public.ampro_performances') IS NOT NULL
     AND to_regclass('public.ampro_programmas') IS NULL THEN
    EXECUTE 'ALTER TABLE public.ampro_performances RENAME TO ampro_programmas';
  END IF;
END $$;

-- Update policies that reference the old table name.

-- 1) Performance/forms mapping policy: public programs lookup
DROP POLICY IF EXISTS ampro_performance_forms_select_public_perf ON public.ampro_performance_forms;
CREATE POLICY "ampro_performance_forms_select_public_perf"
ON public.ampro_performance_forms
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ampro_programmas p
    WHERE p.id = performance_id AND p.is_public = true
  )
);

-- 2) Applications insert policy: keep the stricter profile-complete requirement
DROP POLICY IF EXISTS ampro_applications_insert_own ON public.ampro_applications;
CREATE POLICY "ampro_applications_insert_own"
ON public.ampro_applications
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.ampro_programmas p
    WHERE p.id = performance_id AND p.is_public = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.ampro_dancer_profiles dp
    WHERE dp.user_id = auth.uid()
      AND coalesce(trim(dp.first_name), '') <> ''
      AND coalesce(trim(dp.last_name), '') <> ''
      AND dp.birth_date IS NOT NULL
      AND coalesce(trim(dp.street), '') <> ''
      AND coalesce(trim(dp.house_number), '') <> ''
      AND coalesce(trim(dp.postal_code), '') <> ''
      AND coalesce(trim(dp.city), '') <> ''
  )
);
