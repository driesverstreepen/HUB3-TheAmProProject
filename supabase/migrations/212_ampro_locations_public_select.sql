-- AmPro: allow users to read locations for program details

ALTER TABLE public.ampro_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ampro_locations_select_public" ON public.ampro_locations;
CREATE POLICY "ampro_locations_select_public"
ON public.ampro_locations
FOR SELECT
TO anon, authenticated
USING (true);
