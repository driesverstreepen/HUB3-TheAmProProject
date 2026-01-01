-- Add is_public to studios table
ALTER TABLE public.studios 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_studios_is_public ON public.studios(is_public);

-- Add is_public to programs table
ALTER TABLE public.programs
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_programs_is_public ON public.programs(is_public);
CREATE INDEX IF NOT EXISTS idx_programs_studio_public ON public.programs(studio_id, is_public);

-- Create carts table for bundle purchases
CREATE TABLE IF NOT EXISTS public.carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  studio_id UUID REFERENCES public.studios(id) ON DELETE CASCADE,
  
  -- Cart can be active, checked_out, or expired
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'checked_out', 'expired')),
  
  -- Discount/promo fields
  discount_code TEXT,
  discount_amount INTEGER DEFAULT 0, -- in cents
  discount_percentage INTEGER DEFAULT 0, -- 0-100
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  
  UNIQUE(user_id, studio_id, status)
);

-- Create cart_items table
CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  
  -- For sub-profile enrollments (TODO: add when sub_profiles feature is implemented)
  -- sub_profile_id UUID REFERENCES public.sub_profiles(id) ON DELETE CASCADE,
  
  -- Pricing snapshot (in case program price changes)
  price_snapshot INTEGER, -- in cents
  currency TEXT DEFAULT 'EUR',
  
  -- Timestamps
  added_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(cart_id, program_id)
);

-- Create indexes for cart queries
CREATE INDEX IF NOT EXISTS idx_carts_user_status ON public.carts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_carts_studio ON public.carts(studio_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_program ON public.cart_items(program_id);

-- Enable RLS on carts
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for carts

-- Users can view their own carts
CREATE POLICY "Users can view their own carts"
  ON public.carts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own carts
CREATE POLICY "Users can create their own carts"
  ON public.carts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own active carts
CREATE POLICY "Users can update their own active carts"
  ON public.carts
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'active');

-- Users can delete their own carts
CREATE POLICY "Users can delete their own carts"
  ON public.carts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Studio admins can view carts for their studio
CREATE POLICY "Studio admins can view studio carts"
  ON public.carts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.studio_id = carts.studio_id
        AND user_roles.role = 'studio_admin'
    )
  );

-- Enable RLS on cart_items
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cart_items

-- Users can view items in their own carts
CREATE POLICY "Users can view their own cart items"
  ON public.cart_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE carts.id = cart_items.cart_id
        AND carts.user_id = auth.uid()
    )
  );

-- Users can add items to their own carts
CREATE POLICY "Users can add items to their own carts"
  ON public.cart_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE carts.id = cart_items.cart_id
        AND carts.user_id = auth.uid()
        AND carts.status = 'active'
    )
  );

-- Users can update items in their own active carts
CREATE POLICY "Users can update their own cart items"
  ON public.cart_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE carts.id = cart_items.cart_id
        AND carts.user_id = auth.uid()
        AND carts.status = 'active'
    )
  );

-- Users can delete items from their own carts
CREATE POLICY "Users can delete their own cart items"
  ON public.cart_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE carts.id = cart_items.cart_id
        AND carts.user_id = auth.uid()
    )
  );

-- Trigger to update updated_at timestamp on carts
CREATE OR REPLACE FUNCTION update_carts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW
  EXECUTE FUNCTION update_carts_updated_at();

-- Function to automatically expire old carts
CREATE OR REPLACE FUNCTION expire_old_carts()
RETURNS void AS $$
BEGIN
  UPDATE public.carts
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Comment on tables
COMMENT ON TABLE public.carts IS 'Shopping carts for multi-program enrollment with bundle discounts';
COMMENT ON TABLE public.cart_items IS 'Individual program items in shopping carts';
COMMENT ON COLUMN public.studios.is_public IS 'Whether the studio is visible to public users on explore page';
COMMENT ON COLUMN public.programs.is_public IS 'Whether the program is visible to public users';
