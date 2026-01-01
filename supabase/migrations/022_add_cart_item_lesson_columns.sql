-- Add lesson-detail columns to cart_items so proeflessen can be stored per-lesson
-- and allow multiple lesson-specific cart_items for the same program.

BEGIN;

-- Add columns to hold lesson reference and arbitrary lesson metadata
ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS lesson_detail_type TEXT,
  ADD COLUMN IF NOT EXISTS lesson_detail_id TEXT,
  ADD COLUMN IF NOT EXISTS lesson_metadata JSONB;

-- The original migration created a UNIQUE(cart_id, program_id) constraint which
-- prevents adding multiple distinct proeflessen for the same program to one cart.
-- Drop that constraint if present and replace it with two conditional unique
-- indexes that allow either a single program-level item OR multiple lesson-level
-- items distinguished by lesson_detail_id.

ALTER TABLE public.cart_items
  DROP CONSTRAINT IF EXISTS cart_items_cart_id_program_id_key;

-- Unique constraint for items that reference the program (non-lesson items)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_unique_cart_program_nulllesson
  ON public.cart_items (cart_id, program_id)
  WHERE lesson_detail_id IS NULL;

-- Unique constraint for lesson-specific items (allow multiple different lesson_detail_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_unique_cart_program_lesson
  ON public.cart_items (cart_id, program_id, lesson_detail_id)
  WHERE lesson_detail_id IS NOT NULL;

-- Helpful indexes for queries
CREATE INDEX IF NOT EXISTS idx_cart_items_lesson_detail_id ON public.cart_items(lesson_detail_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_lesson_detail_type ON public.cart_items(lesson_detail_type);

COMMIT;

-- Note: After applying this migration, ensure your Supabase/PostgREST schema cache is
-- refreshed (or restart the API dev process) so the new columns are visible to the
-- runtime. Also verify RLS policies if you have custom checks that reference these
-- new columns (the existing policies in the repo do not reference them).
