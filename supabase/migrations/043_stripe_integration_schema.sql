-- Migration 043: Stripe Integration Schema
-- Platform Stripe config, Studio Connect accounts, Products, Transactions

-- Platform Stripe Configuration (managed by super admin)
CREATE TABLE IF NOT EXISTS public.platform_stripe_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_account_id TEXT, -- Platform's main Stripe account ID (optional)
  stripe_publishable_key TEXT, -- For client-side
  stripe_secret_key_encrypted TEXT, -- Encrypted, only accessible by backend
  webhook_secret_encrypted TEXT,
  platform_fee_percent DECIMAL(5,2) DEFAULT 10.00, -- Default 10% platform fee
  is_live_mode BOOLEAN DEFAULT false, -- Test mode by default
  currency TEXT DEFAULT 'eur',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Only one config row should exist
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_stripe_config_singleton ON public.platform_stripe_config ((true));

-- Studio Stripe Connect Accounts
CREATE TABLE IF NOT EXISTS public.studio_stripe_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL UNIQUE, -- Stripe Connect account ID
  account_type TEXT DEFAULT 'express', -- express or standard
  charges_enabled BOOLEAN DEFAULT false,
  payouts_enabled BOOLEAN DEFAULT false,
  details_submitted BOOLEAN DEFAULT false,
  country TEXT DEFAULT 'BE',
  currency TEXT DEFAULT 'eur',
  email TEXT,
  business_name TEXT,
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_url TEXT, -- Current onboarding link
  onboarding_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(studio_id) -- One Connect account per studio
);

CREATE INDEX IF NOT EXISTS idx_studio_stripe_accounts_studio_id ON public.studio_stripe_accounts(studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_stripe_accounts_stripe_id ON public.studio_stripe_accounts(stripe_account_id);

-- Stripe Products (synced from programs)
CREATE TABLE IF NOT EXISTS public.stripe_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  stripe_product_id TEXT NOT NULL, -- Stripe Product ID
  stripe_account_id TEXT, -- Connect account ID (if applicable)
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(program_id, stripe_account_id) -- One product per program per account
);

CREATE INDEX IF NOT EXISTS idx_stripe_products_program_id ON public.stripe_products(program_id);
CREATE INDEX IF NOT EXISTS idx_stripe_products_studio_id ON public.stripe_products(studio_id);
CREATE INDEX IF NOT EXISTS idx_stripe_products_stripe_id ON public.stripe_products(stripe_product_id);

-- Stripe Prices (pricing for products)
CREATE TABLE IF NOT EXISTS public.stripe_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_product_id UUID NOT NULL REFERENCES public.stripe_products(id) ON DELETE CASCADE,
  stripe_price_id TEXT NOT NULL UNIQUE, -- Stripe Price ID
  amount BIGINT NOT NULL, -- Amount in cents
  currency TEXT DEFAULT 'eur',
  interval TEXT, -- null for one-time, 'month' or 'year' for subscriptions
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_prices_product_id ON public.stripe_prices(stripe_product_id);
CREATE INDEX IF NOT EXISTS idx_stripe_prices_stripe_id ON public.stripe_prices(stripe_price_id);

-- Stripe Subscriptions (for recurring payments)
CREATE TABLE IF NOT EXISTS public.stripe_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  status TEXT NOT NULL, -- active, canceled, past_due, etc.
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_user_id ON public.stripe_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_program_id ON public.stripe_subscriptions(program_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_stripe_id ON public.stripe_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status ON public.stripe_subscriptions(status);

-- Stripe Transactions (payment tracking)
CREATE TABLE IF NOT EXISTS public.stripe_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(user_id) ON DELETE SET NULL,
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  
  -- Stripe IDs
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  stripe_checkout_session_id TEXT,
  stripe_account_id TEXT, -- Connect account that received payment
  
  -- Transaction details
  amount BIGINT NOT NULL, -- Total amount in cents
  currency TEXT DEFAULT 'eur',
  platform_fee BIGINT, -- Platform fee in cents
  net_amount BIGINT, -- Amount studio receives after platform fee
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, succeeded, failed, refunded
  payment_method TEXT, -- card, sepa_debit, etc.
  
  -- Metadata
  description TEXT,
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_transactions_user_id ON public.stripe_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_studio_id ON public.stripe_transactions(studio_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_program_id ON public.stripe_transactions(program_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_payment_intent ON public.stripe_transactions(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_status ON public.stripe_transactions(status);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_created_at ON public.stripe_transactions(created_at DESC);

-- Enable RLS on all tables
ALTER TABLE public.platform_stripe_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_stripe_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Platform Config (super admin only read/write, others no access)
CREATE POLICY platform_stripe_config_super_admin ON public.platform_stripe_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- RLS Policies: Studio Stripe Accounts (studio admins can read/update their own)
CREATE POLICY studio_stripe_accounts_select ON public.studio_stripe_accounts
  FOR SELECT
  USING (
    studio_id IN (
      SELECT studio_id FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  );

CREATE POLICY studio_stripe_accounts_update ON public.studio_stripe_accounts
  FOR UPDATE
  USING (
    studio_id IN (
      SELECT studio_id FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  );

-- RLS Policies: Products (studio admins can manage their own, users can view active)
CREATE POLICY stripe_products_studio_manage ON public.stripe_products
  FOR ALL
  USING (
    studio_id IN (
      SELECT studio_id FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  );

CREATE POLICY stripe_products_users_view ON public.stripe_products
  FOR SELECT
  USING (active = true);

-- RLS Policies: Prices (follow products)
CREATE POLICY stripe_prices_studio_manage ON public.stripe_prices
  FOR ALL
  USING (
    stripe_product_id IN (
      SELECT id FROM public.stripe_products 
      WHERE studio_id IN (
        SELECT studio_id FROM public.user_roles 
        WHERE user_id = auth.uid() AND role = 'studio_admin'
      )
    )
  );

CREATE POLICY stripe_prices_users_view ON public.stripe_prices
  FOR SELECT
  USING (active = true);

-- RLS Policies: Subscriptions (users can view their own, studios can view theirs)
CREATE POLICY stripe_subscriptions_users_view ON public.stripe_subscriptions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY stripe_subscriptions_studio_view ON public.stripe_subscriptions
  FOR SELECT
  USING (
    studio_id IN (
      SELECT studio_id FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  );

-- RLS Policies: Transactions (users view own, studios view theirs, super admin all)
CREATE POLICY stripe_transactions_users_view ON public.stripe_transactions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY stripe_transactions_studio_view ON public.stripe_transactions
  FOR SELECT
  USING (
    studio_id IN (
      SELECT studio_id FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  );

CREATE POLICY stripe_transactions_super_admin_view ON public.stripe_transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_stripe_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_stripe_config_updated_at
  BEFORE UPDATE ON public.platform_stripe_config
  FOR EACH ROW EXECUTE FUNCTION update_stripe_updated_at();

CREATE TRIGGER studio_stripe_accounts_updated_at
  BEFORE UPDATE ON public.studio_stripe_accounts
  FOR EACH ROW EXECUTE FUNCTION update_stripe_updated_at();

CREATE TRIGGER stripe_products_updated_at
  BEFORE UPDATE ON public.stripe_products
  FOR EACH ROW EXECUTE FUNCTION update_stripe_updated_at();

CREATE TRIGGER stripe_prices_updated_at
  BEFORE UPDATE ON public.stripe_prices
  FOR EACH ROW EXECUTE FUNCTION update_stripe_updated_at();

CREATE TRIGGER stripe_subscriptions_updated_at
  BEFORE UPDATE ON public.stripe_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_stripe_updated_at();

CREATE TRIGGER stripe_transactions_updated_at
  BEFORE UPDATE ON public.stripe_transactions
  FOR EACH ROW EXECUTE FUNCTION update_stripe_updated_at();

-- End of migration
