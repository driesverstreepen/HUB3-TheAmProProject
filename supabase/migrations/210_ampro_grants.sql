-- Ensure PostgREST (Supabase API) can expose AmPro tables for anon/authenticated roles.
-- Without explicit GRANTs, PostgREST may omit tables from the schema cache for these roles,
-- causing errors like: "Could not find the table ... in the schema cache".

-- Schema usage (usually already set in Supabase, but harmless if repeated)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Note: some AmPro tables may not exist yet depending on which migrations were applied.
-- We use to_regclass checks so this file can be safely re-run.

DO $$
BEGIN
	IF to_regclass('public.ampro_programmas') IS NOT NULL THEN
		EXECUTE 'GRANT SELECT ON TABLE public.ampro_programmas TO anon, authenticated';
		EXECUTE 'GRANT INSERT, UPDATE, DELETE ON TABLE public.ampro_programmas TO authenticated';
	END IF;

	IF to_regclass('public.ampro_locations') IS NOT NULL THEN
		EXECUTE 'GRANT SELECT ON TABLE public.ampro_locations TO anon, authenticated';
		EXECUTE 'GRANT INSERT, UPDATE, DELETE ON TABLE public.ampro_locations TO authenticated';
	END IF;

	IF to_regclass('public.ampro_forms') IS NOT NULL THEN
		EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ampro_forms TO authenticated';
	END IF;

	IF to_regclass('public.ampro_performance_forms') IS NOT NULL THEN
		EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ampro_performance_forms TO authenticated';
	END IF;

	IF to_regclass('public.ampro_user_roles') IS NOT NULL THEN
		EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ampro_user_roles TO authenticated';
	END IF;

	IF to_regclass('public.ampro_users') IS NOT NULL THEN
		EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.ampro_users TO authenticated';
	END IF;

	IF to_regclass('public.ampro_dancer_profiles') IS NOT NULL THEN
		EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.ampro_dancer_profiles TO authenticated';
	END IF;

	IF to_regclass('public.ampro_applications') IS NOT NULL THEN
		EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.ampro_applications TO authenticated';
	END IF;

	IF to_regclass('public.ampro_roster') IS NOT NULL THEN
		EXECUTE 'GRANT SELECT ON TABLE public.ampro_roster TO authenticated';
	END IF;

	IF to_regclass('public.ampro_updates') IS NOT NULL THEN
		EXECUTE 'GRANT SELECT ON TABLE public.ampro_updates TO authenticated';
	END IF;

	IF to_regclass('public.ampro_availability') IS NOT NULL THEN
		EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ampro_availability TO authenticated';
	END IF;
END $$;
