-- Migration 300: Complete Stripe integration (single-file)
-- Creates platform config, studio connect accounts, products/prices, subscriptions and transactions

-- Platform Stripe Configuration (managed by super admin)
CREATE TABLE IF NOT EXISTS public.platform_stripe_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_account_id TEXT,
  stripe_publishable_key TEXT,
  stripe_secret_key_encrypted TEXT,
  webhook_secret_encrypted TEXT,
  platform_fee_percent DECIMAL(5,2) DEFAULT 10.00,
  is_live_mode BOOLEAN DEFAULT false,
  currency TEXT DEFAULT 'eur',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_stripe_config_singleton ON public.platform_stripe_config ((true));

-- Studio Stripe Connect Accounts
CREATE TABLE IF NOT EXISTS public.studio_stripe_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL,
  stripe_account_id TEXT NOT NULL UNIQUE,
  account_type TEXT DEFAULT 'express',
  charges_enabled BOOLEAN DEFAULT false,
  payouts_enabled BOOLEAN DEFAULT false,
  details_submitted BOOLEAN DEFAULT false,
  country TEXT DEFAULT 'BE',
  currency TEXT DEFAULT 'eur',
  email TEXT,
  business_name TEXT,
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_url TEXT,
  onboarding_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(studio_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_stripe_accounts_studio_id ON public.studio_stripe_accounts(studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_stripe_accounts_stripe_id ON public.studio_stripe_accounts(stripe_account_id);

-- Stripe Products (synced from programs or AmPro programmas)
CREATE TABLE IF NOT EXISTS public.stripe_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID, -- optional reference to platform programs
  ampro_program_id UUID, -- optional reference to ampro_programmas
  studio_id UUID NOT NULL,
  stripe_product_id TEXT NOT NULL,
  stripe_account_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  -- Price fields (single price per product)
  stripe_price_id TEXT UNIQUE,
  price_amount BIGINT,
  price_currency TEXT DEFAULT 'eur',
  price_interval TEXT,
  price_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(program_id, stripe_account_id, stripe_product_id)
);

CREATE INDEX IF NOT EXISTS idx_stripe_products_program_id ON public.stripe_products(program_id);
CREATE INDEX IF NOT EXISTS idx_stripe_products_ampro_program_id ON public.stripe_products(ampro_program_id);
CREATE INDEX IF NOT EXISTS idx_stripe_products_studio_id ON public.stripe_products(studio_id);
CREATE INDEX IF NOT EXISTS idx_stripe_products_stripe_id ON public.stripe_products(stripe_product_id);

-- Ensure price columns exist on existing installations (single-price model)
ALTER TABLE public.stripe_products
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

ALTER TABLE public.stripe_products
  ADD COLUMN IF NOT EXISTS price_amount BIGINT;

ALTER TABLE public.stripe_products
  ADD COLUMN IF NOT EXISTS price_currency TEXT DEFAULT 'eur';

ALTER TABLE public.stripe_products
  ADD COLUMN IF NOT EXISTS price_interval TEXT;

ALTER TABLE public.stripe_products
  ADD COLUMN IF NOT EXISTS price_active BOOLEAN DEFAULT true;

-- Unique index for stripe_price_id (if desired)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stripe_products_price_id_unique ON public.stripe_products(stripe_price_id);

-- If an older `stripe_prices` table exists, migrate its data into `stripe_products`
DO $$
BEGIN
  IF to_regclass('public.stripe_prices') IS NOT NULL THEN
    -- Update product rows with price data where possible
    UPDATE public.stripe_products sp
    SET
      stripe_price_id = sp2.stripe_price_id,
      price_amount = sp2.amount,
      price_currency = COALESCE(sp2.currency, sp.price_currency),
      price_interval = sp2.interval,
      price_active = sp2.active,
      updated_at = now()
    FROM public.stripe_prices sp2
    WHERE sp.id = sp2.stripe_product_id
      AND (sp.stripe_price_id IS NULL OR sp.stripe_price_id = '');

    -- After migration, drop the old prices table
    BEGIN
      EXECUTE 'DROP TABLE IF EXISTS public.stripe_prices';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not drop stripe_prices table: %', SQLERRM;
    END;
  END IF;
END $$;

-- Stripe Prices (pricing for products)
-- NOTE: price information is stored on `stripe_products` (single price per product)

-- Stripe Subscriptions (optional)
CREATE TABLE IF NOT EXISTS public.stripe_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  program_id UUID NOT NULL,
  studio_id UUID NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  status TEXT NOT NULL,
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

-- Stripe Transactions (payment tracking)
CREATE TABLE IF NOT EXISTS public.stripe_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  studio_id UUID NOT NULL,
  program_id UUID,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  stripe_checkout_session_id TEXT,
  stripe_account_id TEXT,
  amount BIGINT NOT NULL,
  currency TEXT DEFAULT 'eur',
  platform_fee BIGINT,
  net_amount BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
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

-- Enable RLS on all tables (if RLS is in use in your project)
ALTER TABLE public.platform_stripe_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_stripe_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_products ENABLE ROW LEVEL SECURITY;
-- `stripe_prices` removed; price info lives on `stripe_products`
ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies (basic safe defaults; review for your deployment)
-- Platform config: super admin only
DO $$
BEGIN
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    BEGIN
      CREATE POLICY platform_stripe_config_super_admin ON public.platform_stripe_config
        FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'
          )
        );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- Products: users can SELECT active rows; studio admins manage their own (adjust per project roles)
DO $$
BEGIN
  BEGIN
    CREATE POLICY stripe_products_users_view ON public.stripe_products
      FOR SELECT
      USING (active = true);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- Prices: users can see active prices
-- Price policies no longer needed (single-table design)

-- Add FK constraints for ampro_program_id if ampro_programmas exists
DO $$
BEGIN
  IF to_regclass('public.ampro_programmas') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      WHERE c.conrelid = 'public.stripe_products'::regclass
        AND c.contype = 'f'
        AND pg_get_constraintdef(c.oid) ILIKE '%ampro_program_id%'
    ) THEN
      ALTER TABLE public.stripe_products
        ADD CONSTRAINT stripe_products_ampro_program_id_fkey
        FOREIGN KEY (ampro_program_id)
        REFERENCES public.ampro_programmas(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Optionally add FK to platform programs if that table exists
DO $$
BEGIN
  IF to_regclass('public.programs') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      WHERE c.conrelid = 'public.stripe_products'::regclass
        AND c.contype = 'f'
        AND pg_get_constraintdef(c.oid) ILIKE '%program_id%'
    ) THEN
      ALTER TABLE public.stripe_products
        ADD CONSTRAINT stripe_products_program_id_fkey
        FOREIGN KEY (program_id)
        REFERENCES public.programs(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Safe updated_at trigger if project uses `set_updated_at()`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t WHERE t.tgname = 'stripe_products_set_updated_at'
    ) THEN
      EXECUTE 'CREATE TRIGGER stripe_products_set_updated_at BEFORE UPDATE ON public.stripe_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();';
    END IF;
  END IF;
END $$;

-- End of migration 300
