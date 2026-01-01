-- restore_user_roles.sql
-- Use this in Supabase SQL Editor to restore `user_roles` for test users.
-- Replace the VALUES below with the actual emails and desired roles.
-- If you want to assign a studio_admin role, provide the studio's name (column `naam`) in the 3rd column.
-- Example rows: ('alice@example.com','super_admin',NULL), ('bob@studio.com','studio_admin','My Studio Name')

BEGIN;

CREATE TEMP TABLE desired_roles (
  email TEXT,
  role TEXT,
  studio_slug TEXT
);

INSERT INTO desired_roles (email, role, studio_slug) VALUES
  -- TODO: replace with your test users
  ('super@you.com', 'super_admin', NULL),
  ('studioadmin@example.com', 'studio_admin', 'my-studio-slug');

-- Preview matches (which users exist?):
SELECT dr.email, dr.role, u.id as user_id
FROM desired_roles dr
LEFT JOIN auth.users u ON u.email = dr.email;

-- Insert or update user_roles
INSERT INTO public.user_roles (user_id, role, studio_id, created_at, updated_at)
SELECT u.id, dr.role, s.id, now(), now()
FROM desired_roles dr
JOIN auth.users u ON u.email = dr.email
LEFT JOIN public.studios s ON s.naam = dr.studio_slug
ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role,
      studio_id = EXCLUDED.studio_id,
      updated_at = now();

-- Show which desired emails were not found in auth.users
SELECT dr.email
FROM desired_roles dr
LEFT JOIN auth.users u ON u.email = dr.email
WHERE u.id IS NULL;

COMMIT;

-- After running: verify with
-- SELECT * FROM public.user_roles WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('super@you.com','studioadmin@example.com'));

-- IMPORTANT:
-- - If you disabled RLS earlier (temporary), re-enable it once you are done or adapt policies.
--   To re-enable: ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
-- - If you want me to populate this with the actual test emails and studio slugs, paste them here and I will prepare the SQL for you.
