-- 057_create_reorder_faqs_function.sql
-- Create a helper function to atomically reorder faqs from a JSON array

BEGIN;

CREATE OR REPLACE FUNCTION public.reorder_faqs(rows_json json) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  rec record;
BEGIN
  -- Iterate over provided rows and update display_order accordingly
  FOR rec IN SELECT * FROM json_to_recordset(rows_json) AS (id uuid, display_order int) LOOP
    UPDATE public.faqs SET display_order = rec.display_order WHERE id = rec.id;
  END LOOP;
END;
$$ SECURITY DEFINER;

COMMIT;
