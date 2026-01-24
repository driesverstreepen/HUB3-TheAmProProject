-- Migration 300: Link stripe_products to AmPro programmas

-- Add optional foreign key column to support AmPro program linkage
ALTER TABLE public.stripe_products
  ADD COLUMN IF NOT EXISTS ampro_program_id UUID;

-- Add FK constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.stripe_products'::regclass
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%ampro_program_id%'
  ) THEN
    ALTER TABLE public.stripe_products
      ADD CONSTRAINT stripe_products_ampro_program_id_fkey
      FOREIGN KEY (ampro_program_id)
      REFERENCES public.ampro_programmas(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Index to speed up lookups
CREATE INDEX IF NOT EXISTS idx_stripe_products_ampro_program_id ON public.stripe_products(ampro_program_id);

-- Enable RLS for this column is already covered by table RLS policies; adjust policies if needed separately.

-- Update trigger for updated_at if present (no-op if trigger exists elsewhere)
-- (No trigger changes in this migration)
