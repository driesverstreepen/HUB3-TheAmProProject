-- Migration: Add studio admins to studio_members table
-- This script ensures all studio owners (eigenaar_id) are properly registered in studio_members

-- Insert studio owners into studio_members if they don't already exist
INSERT INTO studio_members (studio_id, user_id, role, joined_at)
SELECT 
  s.id as studio_id,
  s.eigenaar_id as user_id,
  'admin' as role,
  s.created_at as joined_at
FROM studios s
WHERE s.eigenaar_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM studio_members sm 
    WHERE sm.studio_id = s.id 
      AND sm.user_id = s.eigenaar_id
  );

-- Show results
SELECT 
  s.naam as studio_name,
  s.id as studio_id,
  s.eigenaar_id,
  CASE 
    WHEN sm.id IS NOT NULL THEN 'Already exists'
    ELSE 'Was just inserted'
  END as status
FROM studios s
LEFT JOIN studio_members sm ON sm.studio_id = s.id AND sm.user_id = s.eigenaar_id
WHERE s.eigenaar_id IS NOT NULL
ORDER BY s.created_at DESC;
