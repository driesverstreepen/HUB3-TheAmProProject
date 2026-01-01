-- Add subscription fields to studios table
-- This enables pricing tiers for studio owners only
-- Regular users always have free access to browse and enroll

-- Add subscription columns
ALTER TABLE public.studios 
ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'plus', 'pro')),
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'expired')),
ADD COLUMN IF NOT EXISTS subscription_period VARCHAR(20) DEFAULT 'monthly' CHECK (subscription_period IN ('monthly', 'yearly')),
ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);

-- Add comments for documentation
COMMENT ON COLUMN public.studios.subscription_tier IS 'Pricing tier: basic (€5/mo), plus (€10/mo), pro (€15/mo). Only applies to studio owners, not regular users.';
COMMENT ON COLUMN public.studios.subscription_status IS 'Current subscription status';
COMMENT ON COLUMN public.studios.subscription_period IS 'Billing period: monthly or yearly';
COMMENT ON COLUMN public.studios.trial_end_date IS 'End date of free trial period (14 days)';

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_studios_subscription_tier ON public.studios(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_studios_subscription_status ON public.studios(subscription_status);
CREATE INDEX IF NOT EXISTS idx_studios_stripe_customer_id ON public.studios(stripe_customer_id);

-- Update existing studios to have a 14-day trial of Pro tier
UPDATE public.studios 
SET 
  subscription_tier = 'pro',
  subscription_status = 'trial',
  trial_end_date = NOW() + INTERVAL '14 days'
WHERE subscription_tier IS NULL OR subscription_tier = '';

-- Create a function to check if a studio has access to a feature
CREATE OR REPLACE FUNCTION public.studio_has_feature(
  p_studio_id UUID,
  p_feature_key VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_tier VARCHAR;
  v_status VARCHAR;
  v_trial_end TIMESTAMP;
  v_features JSONB;
BEGIN
  -- Get studio subscription info
  SELECT subscription_tier, subscription_status, trial_end_date, features
  INTO v_tier, v_status, v_trial_end, v_features
  FROM public.studios
  WHERE id = p_studio_id;
  
  -- If studio not found, deny access
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Check if subscription is active or in trial
  IF v_status = 'trial' AND v_trial_end > NOW() THEN
    -- During trial, allow pro features
    v_tier := 'pro';
  ELSIF v_status NOT IN ('active', 'trial') THEN
    -- Expired/canceled subscriptions fall back to basic
    v_tier := 'basic';
  END IF;
  
  -- Check feature flag in features column
  IF v_features IS NOT NULL AND v_features ? p_feature_key THEN
    RETURN (v_features->p_feature_key)::boolean;
  END IF;
  
  -- Feature tier mapping
  CASE p_feature_key
    -- Basic features (all tiers)
    WHEN 'basic_profile', 'publish_programs' THEN
      RETURN TRUE;
    
    -- Plus features
    WHEN 'member_management', 'online_payments', 'enrollment_forms', 'waitlists' THEN
      RETURN v_tier IN ('plus', 'pro');
    
    -- Pro features
    WHEN 'teacher_management', 'attendance_tracking', 'attendance_allow_late', 
         'class_passes', 'notifications', 'api_access', 'multi_location' THEN
      RETURN v_tier = 'pro';
    
    ELSE
      -- Unknown feature, deny by default
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.studio_has_feature(UUID, VARCHAR) TO authenticated;

-- Create a view for studio subscription info (useful for frontend)
CREATE OR REPLACE VIEW public.studio_subscription_info AS
SELECT 
  s.id,
  s.naam,
  s.subscription_tier,
  s.subscription_status,
  s.subscription_period,
  s.subscription_start_date,
  s.subscription_end_date,
  s.trial_end_date,
  CASE 
    WHEN s.subscription_status = 'trial' AND s.trial_end_date > NOW() THEN TRUE
    ELSE FALSE
  END AS is_trial_active,
  CASE
    WHEN s.subscription_status = 'trial' AND s.trial_end_date > NOW() THEN 
      EXTRACT(EPOCH FROM (s.trial_end_date - NOW())) / 86400
    ELSE 0
  END AS trial_days_remaining,
  CASE s.subscription_tier
    WHEN 'basic' THEN 
      CASE s.subscription_period 
        WHEN 'yearly' THEN 50.00
        ELSE 5.00
      END
    WHEN 'plus' THEN 
      CASE s.subscription_period
        WHEN 'yearly' THEN 100.00
        ELSE 10.00
      END
    WHEN 'pro' THEN
      CASE s.subscription_period
        WHEN 'yearly' THEN 120.00
        ELSE 15.00
      END
  END AS current_price
FROM public.studios s;

-- Grant select permission on view
GRANT SELECT ON public.studio_subscription_info TO authenticated;

-- Add RLS policy to allow studio admins to view their subscription info
CREATE POLICY "Studio admins can view their subscription info"
ON public.studios
FOR SELECT
USING (
  -- Studio owner can view
  eigenaar_id = auth.uid()
  OR
  -- Studio admin can view
  EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_roles.studio_id = studios.id 
    AND user_roles.user_id = auth.uid() 
    AND user_roles.role = 'studio_admin'
  )
  OR
  -- Everyone can view basic public info (naam, stad, etc)
  -- This ensures regular users can still browse studios
  TRUE
);

-- Verify the changes
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'studios' 
AND column_name LIKE 'subscription%'
ORDER BY ordinal_position;
