-- Development: Enable Pro subscription for test studios
-- This updates the studios table directly for testing purposes
-- WARNING: Only use in development/testing environments!

-- The subscription data is stored in the 'studios' table
-- studio_subscription_info is just a VIEW on top of it

-- Option 1: Give specific studio Pro membership for 1 year
-- Replace 'YOUR_STUDIO_ID' with actual UUID
/*
UPDATE studios
SET 
  subscription_tier = 'pro',
  subscription_status = 'active',
  subscription_period = 'yearly',
  subscription_start_date = now(),
  subscription_end_date = now() + interval '1 year',
  trial_end_date = NULL  -- Remove trial status
WHERE id = 'YOUR_STUDIO_ID';
*/

-- Option 2: Give ALL studios Pro membership (useful for dev testing)
/*
UPDATE studios
SET 
  subscription_tier = 'pro',
  subscription_status = 'active',
  subscription_period = 'yearly',
  subscription_start_date = now(),
  subscription_end_date = now() + interval '1 year',
  trial_end_date = NULL;
*/

-- Option 3: Extend trial period to Pro for specific studio
/*
UPDATE studios
SET 
  subscription_tier = 'pro',
  subscription_status = 'trial',
  trial_end_date = now() + interval '90 days'
WHERE id = 'YOUR_STUDIO_ID';
*/

-- Query to check subscription info for all studios:
-- SELECT 
--   id, 
--   naam, 
--   subscription_tier, 
--   subscription_status,
--   subscription_end_date,
--   trial_end_date
-- FROM studios;

-- Query to check subscription info via the view:
-- SELECT * FROM studio_subscription_info;

-- Note: If RLS policies block your updates, temporarily disable them:
-- ALTER TABLE studios DISABLE ROW LEVEL SECURITY;
-- (Don't forget to re-enable after testing!)
-- ALTER TABLE studios ENABLE ROW LEVEL SECURITY;
