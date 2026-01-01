-- 028_fix_complete_checkout.sql
-- Fix the complete_checkout function to properly handle the INSERT and UPDATE operations

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

  -- Insert enrollments and capture the result
  WITH to_insert AS (
    SELECT
      (value->>'program_id')::uuid AS program_id,
      COALESCE((value->>'status')::text, 'actief') AS status,
      value->>'opmerking' AS opmerking,
      COALESCE(value->'form_data', '{}'::jsonb) AS form_data,
      COALESCE(value->'profile_snapshot', '{}'::jsonb) AS profile_snapshot
    FROM jsonb_array_elements(p_enrollments) as t(value)
  ), inserted_rows AS (
    INSERT INTO public.inschrijvingen (user_id, program_id, status, opmerking, form_data, profile_snapshot)
    SELECT p_user_id, program_id, status, NULLIF(opmerking, '')::text, form_data, profile_snapshot 
    FROM to_insert
    RETURNING *
  )
  SELECT coalesce(jsonb_agg(to_jsonb(inserted_rows.*)), '[]'::jsonb) INTO inserted FROM inserted_rows;

  -- Update cart status to completed
  UPDATE public.carts SET status = 'completed', updated_at = now() WHERE id = p_cart_id;

  RETURN inserted;
END;
$$;
