-- Add sub_profile_id to cart_items so items can be associated with a selected sub-profile
-- This migration is reversible by dropping the column if necessary.

ALTER TABLE IF EXISTS public.cart_items
  ADD COLUMN IF NOT EXISTS sub_profile_id UUID REFERENCES public.sub_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cart_items_sub_profile_id ON public.cart_items(sub_profile_id);

-- Note: RLS policies on cart_items reference the owning cart via carts.id = cart_items.cart_id
-- which will continue to enforce user ownership. Ensure the application validates that any
-- supplied sub_profile_id belongs to the user when updating/inserting cart items.
