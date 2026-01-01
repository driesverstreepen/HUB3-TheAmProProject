-- Migration 039: Add missing studio admin entry
-- This adds the current user as studio admin if they're missing from studio_admin_profiles

-- Check if user ff8dd0ce-d531-41ab-ba5f-3bb581ab1602 is already a studio admin for studio 0d219ace-260c-4dc7-b490-20333da3acbf
-- If not, add them

INSERT INTO public.studio_admin_profiles (user_id, studio_id, created_at)
VALUES (
  'ff8dd0ce-d531-41ab-ba5f-3bb581ab1602'::uuid,
  '0d219ace-260c-4dc7-b490-20333da3acbf'::uuid,
  now()
)
ON CONFLICT (user_id, studio_id) DO NOTHING;

-- Also ensure they have the studio_admin role in user_roles
INSERT INTO public.user_roles (user_id, studio_id, role, created_at)
VALUES (
  'ff8dd0ce-d531-41ab-ba5f-3bb581ab1602'::uuid,
  '0d219ace-260c-4dc7-b490-20333da3acbf'::uuid,
  'studio_admin',
  now()
)
ON CONFLICT (user_id, studio_id, role) DO NOTHING;
