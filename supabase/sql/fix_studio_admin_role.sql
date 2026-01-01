-- Fix: Add studio_admin role for user
-- User ID: aac9dd28-3b67-4f17-a093-dfa4947a73fa
-- Studio ID: d517cb28-f65f-4785-a2d6-18c62cd3d115

-- First, let's check what role this user currently has
SELECT * FROM user_roles WHERE user_id = 'aac9dd28-3b67-4f17-a093-dfa4947a73fa';

-- Option 1: If user has no role yet, insert a new one
INSERT INTO user_roles (user_id, role, studio_id)
VALUES ('aac9dd28-3b67-4f17-a093-dfa4947a73fa', 'studio_admin', 'd517cb28-f65f-4785-a2d6-18c62cd3d115')
ON CONFLICT (user_id) DO UPDATE 
SET role = 'studio_admin', 
    studio_id = 'd517cb28-f65f-4785-a2d6-18c62cd3d115',
    updated_at = now();

-- Verify the change
SELECT * FROM user_roles WHERE user_id = 'aac9dd28-3b67-4f17-a093-dfa4947a73fa';
