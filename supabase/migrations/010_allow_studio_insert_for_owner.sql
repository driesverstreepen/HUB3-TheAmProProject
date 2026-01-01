-- 010_allow_studio_insert_for_owner.sql
-- Allow a user to create a studio row where they are the admin (owner) even if their role is not yet 'studio_admin'.

ALTER TABLE IF EXISTS public.studios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'studios_allow_insert_owner'
      AND polrelid = 'public.studios'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY studios_allow_insert_owner ON public.studios FOR INSERT WITH CHECK (eigenaar_id = auth.uid())';
  END IF;
END$$;

-- End of migration
