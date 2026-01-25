-- Migration 224: Fix ampro_user_roles role CHECK constraint
-- Some DBs may still have role values like 'dancer' in the CHECK constraint.
-- The app expects roles: 'admin' and 'user'.

-- 1) Drop any existing role CHECK constraints first (otherwise updating rows to 'user'
-- may violate a legacy constraint like ('admin','dancer')).

-- Always drop the known constraint name if present.
ALTER TABLE public.ampro_user_roles
  DROP CONSTRAINT IF EXISTS ampro_user_roles_role_check;

DO $$
DECLARE
  cname text;
  role_attnum int;
BEGIN
  SELECT a.attnum
  INTO role_attnum
  FROM pg_attribute a
  WHERE a.attrelid = 'public.ampro_user_roles'::regclass
    AND a.attname = 'role'
    AND a.attisdropped = false;

  FOR cname IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.ampro_user_roles'::regclass
      AND c.contype = 'c'
      AND (
        (role_attnum is not null AND role_attnum = ANY (c.conkey))
        OR pg_get_constraintdef(c.oid) ILIKE '%role%'
      )
  LOOP
    EXECUTE format('alter table public.ampro_user_roles drop constraint %I', cname);
  END LOOP;
END $$;

-- 2) Normalize existing rows (best-effort)
-- If older DBs used 'dancer', normalize to 'user'.
update public.ampro_user_roles
set role = 'user'
where role = 'dancer';

-- If there are any other unexpected values, normalize them to 'user' as well.
update public.ampro_user_roles
set role = 'user'
where role is null or (role <> 'admin' and role <> 'user' and role <> 'dancer');

-- 3) Recreate a compatible constraint.
-- Allow both 'user' and legacy 'dancer' so auth triggers / invite claims can't fail
-- on projects that haven't been fully cleaned up yet.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.ampro_user_roles'::regclass
      AND c.contype = 'c'
      AND c.conname = 'ampro_user_roles_role_check'
  ) THEN
    ALTER TABLE public.ampro_user_roles DROP CONSTRAINT ampro_user_roles_role_check;
  END IF;

  ALTER TABLE public.ampro_user_roles
    ADD CONSTRAINT ampro_user_roles_role_check
    CHECK (role IN ('admin', 'user', 'dancer'));
END $$;
