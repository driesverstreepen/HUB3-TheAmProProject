-- Studio favorites (user_favorite_studios)

CREATE TABLE IF NOT EXISTS public.user_favorite_studios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS user_favorite_studios_user_id_studio_id_key
  ON public.user_favorite_studios(user_id, studio_id);

-- Helpful index for listing by user
CREATE INDEX IF NOT EXISTS user_favorite_studios_user_id_idx
  ON public.user_favorite_studios(user_id);

ALTER TABLE public.user_favorite_studios ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view their favorite studios" ON public.user_favorite_studios;
DROP POLICY IF EXISTS "Users can add favorite studios" ON public.user_favorite_studios;
DROP POLICY IF EXISTS "Users can remove favorite studios" ON public.user_favorite_studios;

CREATE POLICY "Users can view their favorite studios"
  ON public.user_favorite_studios
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can add favorite studios"
  ON public.user_favorite_studios
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove favorite studios"
  ON public.user_favorite_studios
  FOR DELETE
  USING (user_id = auth.uid());
