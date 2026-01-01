-- Migration: repoint FKs away from legacy table `trial_lessons`, backup it and drop it
-- Preconditions (run manually before applying):
--  SELECT COUNT(*) FROM public.trial_lessons; -- should be 0 (you reported 0)
--  Verify orphan checks returned 0 as you indicated.

BEGIN;

-- 1) Drop existing FKs that reference trial_lessons (if they exist)
ALTER TABLE IF EXISTS public.inschrijvingen DROP CONSTRAINT IF EXISTS inschrijvingen_lesson_id_fkey;
ALTER TABLE IF EXISTS public.cart_items DROP CONSTRAINT IF EXISTS cart_items_lesson_id_fkey;
ALTER TABLE IF EXISTS public.lessons DROP CONSTRAINT IF EXISTS lessons_trial_lesson_id_fkey;

-- 2) Recreate FKs to point to public.lessons(id) instead of public.trial_lessons
-- Use ON DELETE SET NULL to preserve historical enrollments/cart items when a lesson is removed.
ALTER TABLE IF EXISTS public.inschrijvingen
  ADD CONSTRAINT inschrijvingen_lesson_id_fkey
  FOREIGN KEY (lesson_id)
  REFERENCES public.lessons(id)
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

ALTER TABLE IF EXISTS public.cart_items
  ADD CONSTRAINT cart_items_lesson_id_fkey
  FOREIGN KEY (lesson_id)
  REFERENCES public.lessons(id)
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

-- If you prefer to keep a reference from lessons.trial_lesson_id to lessons(id) (self-reference), recreate it.
ALTER TABLE IF EXISTS public.lessons
  ADD CONSTRAINT lessons_trial_lesson_id_fkey
  FOREIGN KEY (trial_lesson_id)
  REFERENCES public.lessons(id)
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

-- 3) Make an on-DB backup copy of trial_lessons (fast rollback if needed)
CREATE TABLE IF NOT EXISTS public.backup_trial_lessons AS TABLE public.trial_lessons WITH NO DATA;
INSERT INTO public.backup_trial_lessons SELECT * FROM public.trial_lessons;

-- 4) Finally, drop the legacy table
DROP TABLE IF EXISTS public.trial_lessons;

COMMIT;

-- Notes:
-- - This migration assumes the `lesson_id` columns exist on the referencing tables and
--   that your orphan checks returned 0 (no referencing rows left pointing to trial_lessons).
-- - The choice here is to re-point FKs to `public.lessons(id)` with ON DELETE SET NULL.
--   If you'd rather DROP the referencing columns or use another ON DELETE behavior (CASCADE/RESTRICT),
--   edit the statements above accordingly before running.
-- - After applying: refresh PostgREST/schema cache or restart your Supabase dev process so the
--   runtime sees the schema changes. Run smoke tests: program pages, add-to-cart, checkout, webhook.
