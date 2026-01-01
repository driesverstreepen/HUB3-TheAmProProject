-- Add forms table to store studio-specific form definitions
CREATE TABLE IF NOT EXISTS public.forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fields_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_forms_studio ON public.forms(studio_id);

-- Enable RLS
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Iedereen kan formulieren zien"
  ON public.forms FOR SELECT
  USING (true);

CREATE POLICY "Studio admins kunnen formulieren beheren"
  ON public.forms FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.studios s
      WHERE s.id = studio_id AND s.eigenaar_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.studios s
      WHERE s.id = studio_id AND s.eigenaar_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_forms_updated_at BEFORE UPDATE ON public.forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
