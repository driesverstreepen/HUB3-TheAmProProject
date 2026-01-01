-- Migration: Allow studio admins to read user_roles for their studio
-- This enables studio admins to see teachers and other roles in their studio

-- Add policy for studio admins to SELECT user_roles from their studio
DROP POLICY IF EXISTS "Studio admins kunnen user_roles van hun studio lezen" ON public.user_roles;
CREATE POLICY "Studio admins kunnen user_roles van hun studio lezen" 
ON public.user_roles
FOR SELECT
USING (
  -- Allow if the user is a studio_admin of the same studio_id
  EXISTS (
    SELECT 1 
    FROM public.user_roles AS ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'studio_admin'
    AND ur.studio_id = public.user_roles.studio_id
  )
);

-- End of migration
