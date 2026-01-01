-- Auto-generated schema from Supabase database
-- Generated on: October 30, 2025
-- Source: Supabase SQL Editor query

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- cart_items table
CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  cart_id uuid NOT NULL,
  program_id uuid NOT NULL,
  price_snapshot integer,
  currency text DEFAULT 'EUR'::text,
  added_at timestamp with time zone DEFAULT now()
);

-- carts table
CREATE TABLE IF NOT EXISTS public.carts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  studio_id uuid,
  status text DEFAULT 'active'::text,
  discount_code text,
  discount_amount integer DEFAULT 0,
  discount_percentage integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval)
);

-- forms table
CREATE TABLE IF NOT EXISTS public.forms (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  studio_id uuid NOT NULL,
  name text NOT NULL,
  fields_json jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- group_details table
CREATE TABLE IF NOT EXISTS public.group_details (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL,
  weekday integer NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  season_start date,
  season_end date,
  created_at timestamp with time zone DEFAULT now()
);

-- inschrijvingen table
CREATE TABLE IF NOT EXISTS public.inschrijvingen (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  program_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'actief'::text,
  inschrijving_datum timestamp with time zone DEFAULT timezone('utc'::text, now()),
  opmerking text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  form_data jsonb DEFAULT '{}'::jsonb,
  profile_snapshot jsonb DEFAULT '{}'::jsonb
);

-- legal_documents table
CREATE TABLE IF NOT EXISTS public.legal_documents (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  doc_type text NOT NULL,
  content text,
  version text,
  created_at timestamp with time zone DEFAULT now()
);

-- lessons table
CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  program_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  date date,
  time time without time zone,
  duration_minutes integer,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  location_id uuid
);

-- locations table
CREATE TABLE IF NOT EXISTS public.locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  name text NOT NULL,
  city text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- program_locations table
CREATE TABLE IF NOT EXISTS public.program_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL,
  location_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- programs table
CREATE TABLE IF NOT EXISTS public.programs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  studio_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  program_type text NOT NULL,
  price numeric,
  capacity integer,
  is_public boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  dance_style text,
  level text,
  min_age integer,
  max_age integer
);

-- studios table
CREATE TABLE IF NOT EXISTS public.studios (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  naam text NOT NULL,
  beschrijving text,
  adres text,
  stad text,
  postcode text,
  contact_email text,
  website text,
  eigenaar_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  phone_number text,
  location text,
  features jsonb DEFAULT '{}'::jsonb,
  is_public boolean DEFAULT false
);

-- user_consents table
CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  document_type text NOT NULL,
  document_version text,
  consented_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

