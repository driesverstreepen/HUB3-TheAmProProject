-- 024_complete_checkout.sql
-- Create a function that atomically creates enrollments for a cart and marks the cart completed.
-- Parameters: p_cart_id uuid, p_user_id uuid, p_enrollments jsonb (array of enrollment objects)

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_checkout(
  p_cart_id uuid,
  p_user_id uuid,
  p_enrollments jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  inserted jsonb;
BEGIN
  -- Ensure the cart is active and belongs to the requesting user
  PERFORM 1 FROM public.carts WHERE id = p_cart_id AND user_id = p_user_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cart not active, not found or not owned by user';
  END IF;

  WITH to_insert AS (
    SELECT
      (value->>'program_id')::uuid AS program_id,
      (value->>'status')::text AS status,
      value->>'opmerking' AS opmerking,
      value->'form_data' AS form_data,
      value->'profile_snapshot' AS profile_snapshot
    FROM jsonb_array_elements(p_enrollments) as t(value)
  ), inserted_rows AS (
    INSERT INTO public.inschrijvingen (user_id, program_id, status, opmerking, form_data, profile_snapshot)
    SELECT p_user_id, program_id, status, NULLIF(opmerking, '')::text, form_data, profile_snapshot FROM to_insert
    RETURNING *
  )
  UPDATE public.carts SET status = 'completed' WHERE id = p_cart_id;

  SELECT coalesce(jsonb_agg(to_jsonb(inserted_rows.*)), '[]'::jsonb) INTO inserted FROM inserted_rows;
  RETURN inserted;
END;
$$;

COMMIT;
