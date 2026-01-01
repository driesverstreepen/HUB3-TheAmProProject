-- Add RLS policies for public access to program details
-- This allows anonymous users to view group_details and workshop_details
-- for programs that are marked as public

-- Policy for group_details: allow public read access for public programs
CREATE POLICY "Public can view group details for public programs"
  ON public.group_details
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      WHERE programs.id = group_details.program_id
      AND programs.is_public = true
    )
  );

-- Policy for workshop_details: allow public read access for public programs
CREATE POLICY "Public can view workshop details for public programs"
  ON public.workshop_details
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      WHERE programs.id = workshop_details.program_id
      AND programs.is_public = true
    )
  );