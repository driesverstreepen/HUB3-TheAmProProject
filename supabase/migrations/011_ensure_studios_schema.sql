-- Add location column if it doesn't exist (we use this instead of adres/stad/postcode)
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS location TEXT;

-- Ensure eigenaar_id has proper constraint
DO $$ 
BEGIN
  -- Check if foreign key exists, if not add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'studios_eigenaar_id_fkey' 
    AND table_name = 'studios'
  ) THEN
    ALTER TABLE public.studios 
    ADD CONSTRAINT studios_eigenaar_id_fkey 
    FOREIGN KEY (eigenaar_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure NOT NULL on naam and eigenaar_id
ALTER TABLE public.studios ALTER COLUMN naam SET NOT NULL;
ALTER TABLE public.studios ALTER COLUMN eigenaar_id SET NOT NULL;

-- Enable RLS
ALTER TABLE public.studios ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own studio" ON public.studios;
DROP POLICY IF EXISTS "Users can insert their own studio" ON public.studios;
DROP POLICY IF EXISTS "Users can update their own studio" ON public.studios;

-- Allow users to view their own studio
CREATE POLICY "Users can view their own studio"
  ON public.studios
  FOR SELECT
  USING (eigenaar_id = auth.uid());

-- Allow users to insert studio where they are the owner
CREATE POLICY "Users can insert their own studio"
  ON public.studios
  FOR INSERT
  WITH CHECK (eigenaar_id = auth.uid());

-- Allow users to update their own studio
CREATE POLICY "Users can update their own studio"
  ON public.studios
  FOR UPDATE
  USING (eigenaar_id = auth.uid())
  WITH CHECK (eigenaar_id = auth.uid());

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_studios_eigenaar_id ON public.studios(eigenaar_id);
