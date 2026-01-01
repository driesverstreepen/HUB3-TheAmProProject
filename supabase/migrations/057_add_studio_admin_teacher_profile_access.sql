-- Migration 057: Add policy for studio admins to view teacher profiles

-- Add policy allowing studio admins to view profiles of their studio's teachers
CREATE POLICY "user_profiles_studio_admin_view_teachers" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.studio_teachers st
      JOIN public.user_roles ur ON ur.studio_id = st.studio_id
      WHERE st.user_id = user_profiles.user_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'studio_admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.studios s
      WHERE s.eigenaar_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.studio_teachers st
          WHERE st.user_id = user_profiles.user_id
            AND st.studio_id = s.id
        )
    )
  );