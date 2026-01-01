-- Add address field to locations table
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS address TEXT;

-- Add postal_code field for better address handling
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS postal_code TEXT;
