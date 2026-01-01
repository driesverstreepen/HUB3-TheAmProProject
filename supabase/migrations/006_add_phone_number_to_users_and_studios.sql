-- 006_add_phone_number_to_users_and_studios.sql
-- Idempotent migration to add phone_number columns to users and studios, backfill from existing `telefoon` and drop the old column.

DO $$
BEGIN
  -- Add phone_number to users
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE public.users ADD COLUMN phone_number TEXT;
  END IF;

  -- Backfill users.phone_number from telefoon when present
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='telefoon') THEN
    EXECUTE 'UPDATE public.users SET phone_number = telefoon WHERE phone_number IS NULL AND telefoon IS NOT NULL';
  END IF;

  -- Drop old telefoon column on users if exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='telefoon') THEN
    ALTER TABLE public.users DROP COLUMN IF EXISTS telefoon;
  END IF;

  -- Add phone_number to studios
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'studios' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE public.studios ADD COLUMN phone_number TEXT;
  END IF;

  -- Backfill studios.phone_number from telefoon when present
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='studios' AND column_name='telefoon') THEN
    EXECUTE 'UPDATE public.studios SET phone_number = telefoon WHERE phone_number IS NULL AND telefoon IS NOT NULL';
  END IF;

  -- Drop old telefoon column on studios if exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='studios' AND column_name='telefoon') THEN
    ALTER TABLE public.studios DROP COLUMN IF EXISTS telefoon;
  END IF;
END$$;

-- End of migration
