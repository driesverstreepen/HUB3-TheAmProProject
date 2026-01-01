-- Migration 083: create teacher_dance_styles junction table and migrate existing public_teacher_profiles.dance_style arrays into it

BEGIN;

-- 1. Create junction table for teacher <-> dance_styles many-to-many
CREATE TABLE IF NOT EXISTS public.teacher_dance_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_profile_id UUID NOT NULL REFERENCES public.public_teacher_profiles(id) ON DELETE CASCADE,
  dance_style_id INTEGER NOT NULL REFERENCES public.dance_styles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(teacher_profile_id, dance_style_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_dance_styles_teacher ON public.teacher_dance_styles(teacher_profile_id);
CREATE INDEX IF NOT EXISTS idx_teacher_dance_styles_style ON public.teacher_dance_styles(dance_style_id);

-- 2. Migrate existing dance_style arrays from public_teacher_profiles into the junction table
-- We normalize style names to slugs to match canonical table; missing styles will be inserted into public.dance_styles.

-- Extract existing styles from profiles
WITH extracted AS (
  SELECT id AS teacher_profile_id, unnest(dance_style) AS style
  FROM public.public_teacher_profiles
  WHERE dance_style IS NOT NULL
), normalized AS (
  SELECT
    teacher_profile_id,
    style,
    trim(both '-' FROM regexp_replace(lower(style), '[^a-z0-9]+', '-', 'g')) AS slug,
    trim(style) AS name
  FROM extracted
)
-- Insert missing styles into public.dance_styles using slug uniqueness
INSERT INTO public.dance_styles (name, slug, active, created_at)
SELECT DISTINCT n.name, n.slug, true, now()
FROM normalized n
WHERE NOT EXISTS (
  SELECT 1 FROM public.dance_styles d WHERE d.slug = n.slug
);

-- Now link teachers to dance_styles by slug
WITH links AS (
  SELECT n.teacher_profile_id, d.id AS dance_style_id
  FROM (
    SELECT teacher_profile_id, trim(both '-' FROM regexp_replace(lower(style), '[^a-z0-9]+', '-', 'g')) AS slug
    FROM (
      SELECT id AS teacher_profile_id, unnest(dance_style) AS style
      FROM public.public_teacher_profiles
      WHERE dance_style IS NOT NULL
    ) s
  ) n
  JOIN public.dance_styles d ON d.slug = n.slug
)
INSERT INTO public.teacher_dance_styles (teacher_profile_id, dance_style_id, created_at)
SELECT teacher_profile_id, dance_style_id, now()
FROM links
ON CONFLICT (teacher_profile_id, dance_style_id) DO NOTHING;

-- 3. Optionally clear the denormalized column to avoid divergence. We'll keep a backup column from earlier migration.
-- If you prefer to drop the denormalized column, you can uncomment the next line. We keep it for safety.
-- ALTER TABLE public.public_teacher_profiles DROP COLUMN IF EXISTS dance_style;

COMMIT;
