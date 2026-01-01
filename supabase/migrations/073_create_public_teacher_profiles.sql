-- Migration: Create public_teacher_profiles table
-- Created: 2025-11-08

CREATE TABLE IF NOT EXISTS public.public_teacher_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  headline text,
  bio text,
  date_of_birth date,
  contact_email text,
  phone_number text,
  website text,
  photo_url text,
  cv text,
  is_public boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Ensure we have a unique constraint/index on user_id so callers using
-- ON CONFLICT(user_id) can upsert without errors. We create both a
-- constraint for new tables and a unique index idempotently for existing
-- databases that may already have the table.
-- Create a unique index on user_id so ON CONFLICT(user_id) upserts work.
-- We avoid ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS because
-- Postgres does not support IF NOT EXISTS for ADD CONSTRAINT.
-- A unique index is sufficient for ON CONFLICT and is created idempotently below.
CREATE UNIQUE INDEX IF NOT EXISTS uq_public_teacher_profiles_user_id_idx ON public.public_teacher_profiles(user_id);

-- Optional: comment for documentation
COMMENT ON TABLE public.public_teacher_profiles IS 'Public teacher profiles created by users for listing/search';
