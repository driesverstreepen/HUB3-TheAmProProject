-- 092_create_class_pass_system.sql
-- Class Pass System: products, purchases, ledger, and basic RLS

-- 1) Class Pass Products (studio-configured credit packs)
CREATE TABLE IF NOT EXISTS public.class_pass_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  credit_count INT NOT NULL CHECK (credit_count > 0),
  price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'eur',
  expiration_months INT NULL CHECK (expiration_months > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_pass_products_studio ON public.class_pass_products(studio_id);
CREATE INDEX IF NOT EXISTS idx_class_pass_products_active ON public.class_pass_products(active) WHERE active = true;

-- 1b) Add class pass settings to programs table
-- Programs now control which class pass products they accept
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS accepts_class_passes BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS class_pass_product_id UUID REFERENCES public.class_pass_products(id) ON DELETE SET NULL;
-- If class_pass_product_id is NULL and accepts_class_passes is true, program accepts all studio's class pass products
-- If class_pass_product_id is set, program only accepts that specific product

CREATE INDEX IF NOT EXISTS idx_programs_accepts_class_passes ON public.programs(accepts_class_passes) WHERE accepts_class_passes = true;
CREATE INDEX IF NOT EXISTS idx_programs_class_pass_product ON public.programs(class_pass_product_id) WHERE class_pass_product_id IS NOT NULL;

-- 2) Class Pass Purchases (per-user ownership)
CREATE TABLE IF NOT EXISTS public.class_pass_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.class_pass_products(id) ON DELETE RESTRICT,
  credits_total INT NOT NULL CHECK (credits_total >= 0),
  credits_used INT NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  expires_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | refunded | canceled
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_purchase_unique_session UNIQUE (stripe_checkout_session_id)
);

CREATE INDEX IF NOT EXISTS idx_class_pass_purchases_user ON public.class_pass_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_class_pass_purchases_studio ON public.class_pass_purchases(studio_id);
CREATE INDEX IF NOT EXISTS idx_class_pass_purchases_status ON public.class_pass_purchases(status);
CREATE INDEX IF NOT EXISTS idx_class_pass_purchases_expires ON public.class_pass_purchases(expires_at);

-- 3) Class Pass Ledger (balance deltas)
CREATE TABLE IF NOT EXISTS public.class_pass_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES public.class_pass_purchases(id) ON DELETE SET NULL,
  delta INT NOT NULL, -- +N for grants, -1 for consumption
  reason TEXT NOT NULL, -- purchase | enrollment | refund | manual_adjust
  program_id UUID NULL REFERENCES public.programs(id) ON DELETE SET NULL,
  lesson_id UUID NULL REFERENCES public.lessons(id) ON DELETE SET NULL,
  enrollment_id UUID NULL REFERENCES public.inschrijvingen(id) ON DELETE SET NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_pass_ledger_user ON public.class_pass_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_class_pass_ledger_studio ON public.class_pass_ledger(studio_id);
CREATE INDEX IF NOT EXISTS idx_class_pass_ledger_purchase ON public.class_pass_ledger(purchase_id);

-- 4) Triggers for updated_at columns
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS class_pass_products_updated_at ON public.class_pass_products;
CREATE TRIGGER class_pass_products_updated_at
  BEFORE UPDATE ON public.class_pass_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS class_pass_purchases_updated_at ON public.class_pass_purchases;
CREATE TRIGGER class_pass_purchases_updated_at
  BEFORE UPDATE ON public.class_pass_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) RLS policies
ALTER TABLE public.class_pass_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_pass_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_pass_ledger ENABLE ROW LEVEL SECURITY;

-- Products:
-- Studio admins can manage their studio's products
DROP POLICY IF EXISTS class_pass_products_studio_manage ON public.class_pass_products;
CREATE POLICY class_pass_products_studio_manage ON public.class_pass_products
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.studio_members sm
      WHERE sm.studio_id = class_pass_products.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.studio_members sm
      WHERE sm.studio_id = class_pass_products.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner','admin')
    )
  );

-- Public can view active products of public studios
DROP POLICY IF EXISTS class_pass_products_public_view ON public.class_pass_products;
CREATE POLICY class_pass_products_public_view ON public.class_pass_products
  FOR SELECT
  USING (
    active = true AND EXISTS (
      SELECT 1 FROM public.studios s WHERE s.id = class_pass_products.studio_id AND s.is_public = true
    )
  );

-- Purchases:
-- Users can select their own purchases
DROP POLICY IF EXISTS class_pass_purchases_user_select ON public.class_pass_purchases;
CREATE POLICY class_pass_purchases_user_select ON public.class_pass_purchases
  FOR SELECT
  USING (user_id = auth.uid());

-- Studio admins can view purchases for their studio
DROP POLICY IF EXISTS class_pass_purchases_studio_view ON public.class_pass_purchases;
CREATE POLICY class_pass_purchases_studio_view ON public.class_pass_purchases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.studio_members sm
      WHERE sm.studio_id = class_pass_purchases.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner','admin')
    )
  );

-- Service and trusted flows insert/update (handled via service role in webhooks)
-- No general INSERT/UPDATE policy for anon users.

-- Ledger:
-- Users can view their own ledger entries
DROP POLICY IF EXISTS class_pass_ledger_user_select ON public.class_pass_ledger;
CREATE POLICY class_pass_ledger_user_select ON public.class_pass_ledger
  FOR SELECT
  USING (user_id = auth.uid());

-- Studio admins can view ledger for their studio
DROP POLICY IF EXISTS class_pass_ledger_studio_view ON public.class_pass_ledger;
CREATE POLICY class_pass_ledger_studio_view ON public.class_pass_ledger
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.studio_members sm
      WHERE sm.studio_id = class_pass_ledger.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner','admin')
    )
  );

-- 6) Helper view (optional): current balances per user+studio (sum of non-expired purchases only)
CREATE OR REPLACE VIEW public.class_pass_balances AS
SELECT
  l.user_id,
  l.studio_id,
  SUM(l.delta) AS balance
FROM public.class_pass_ledger l
LEFT JOIN public.class_pass_purchases p ON p.id = l.purchase_id
WHERE (
  p.id IS NULL OR p.expires_at IS NULL OR p.expires_at > now()
)
GROUP BY l.user_id, l.studio_id;

-- Note: RLS policies cannot be applied directly to views.
-- Access to this view is governed by RLS on underlying tables.
