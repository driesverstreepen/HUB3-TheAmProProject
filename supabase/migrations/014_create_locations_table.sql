-- Create locations table for studio locations
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Studio admins can manage their own studio's locations
CREATE POLICY "Studio admins can view their studio's locations"
  ON public.locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = locations.studio_id
    )
  );

CREATE POLICY "Studio admins can insert locations for their studio"
  ON public.locations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = locations.studio_id
    )
  );

CREATE POLICY "Studio admins can update their studio's locations"
  ON public.locations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = locations.studio_id
    )
  );

CREATE POLICY "Studio admins can delete their studio's locations"
  ON public.locations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = locations.studio_id
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_locations_studio_id ON public.locations(studio_id);
