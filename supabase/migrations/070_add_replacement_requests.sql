-- Migration: Add replacement_requests table and link from lessons
-- Idempotent: safe to run multiple times

-- Create replacement_requests table
CREATE TABLE IF NOT EXISTS public.replacement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  program_id uuid NULL,
  requested_by uuid NOT NULL,
  requested_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'pending', -- pending | approved | declined | cancelled
  chosen_internal_teacher_id uuid NULL,
  external_teacher_name text NULL,
  external_teacher_email text NULL,
  notes text NULL,
  admin_id uuid NULL,
  admin_decision_at timestamptz NULL,
  metadata jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_replacement_requests_studio_status ON public.replacement_requests (studio_id, status);
CREATE INDEX IF NOT EXISTS idx_replacement_requests_lesson_id ON public.replacement_requests (lesson_id);

-- Add replacement_request_id column to lessons (nullable)
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS replacement_request_id uuid NULL REFERENCES public.replacement_requests(id);

CREATE INDEX IF NOT EXISTS idx_lessons_replacement_request_id ON public.lessons (replacement_request_id);
