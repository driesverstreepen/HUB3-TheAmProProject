-- Migration 104: Extend studio member roles
-- IMPORTANT: Postgres requires new enum values to be committed before use.
-- This migration ONLY adds enum values. The permissions table + seeding lives in Migration 105.

-- 1) Extend enum for studio member roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'studio_member_role' AND e.enumlabel = 'bookkeeper'
  ) THEN
    ALTER TYPE studio_member_role ADD VALUE 'bookkeeper';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'studio_member_role' AND e.enumlabel = 'comms'
  ) THEN
    ALTER TYPE studio_member_role ADD VALUE 'comms';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'studio_member_role' AND e.enumlabel = 'viewer'
  ) THEN
    ALTER TYPE studio_member_role ADD VALUE 'viewer';
  END IF;
END $$;
