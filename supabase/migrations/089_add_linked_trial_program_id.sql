-- Migration: add linked_trial_program_id to programs
-- Adds a nullable FK referencing programs(id) to link a single proefles program to a group program

ALTER TABLE public.programs
ADD COLUMN IF NOT EXISTS linked_trial_program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL;

-- Optional: create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_programs_linked_trial_program_id ON public.programs(linked_trial_program_id);
