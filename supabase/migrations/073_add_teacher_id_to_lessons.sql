-- Add nullable teacher_id to lessons so a lesson can be associated with an auth user (teacher)
-- Adds index for lookups and sets FK to auth.users (nullable)

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_teacher_id ON public.lessons(teacher_id);

-- Note: RLS policies may need to be adjusted to allow studio_admins to set/select this field via client queries.
