-- Migration: Allow studio_admins to SELECT user_profiles when there's a pending invitation for their studio
-- This expands the existing policy so studio admins can see profile/email existence for
-- users who were invited to their studio (by matching pending_teacher_invitations.email).

BEGIN;

-- Replace the previous studio-admin select policy with an extended version
DROP POLICY IF EXISTS "Studio admins can view user profiles" ON public.user_profiles;

CREATE POLICY "Studio admins can view user profiles"
  ON public.user_profiles
  FOR SELECT
  USING (
    -- Owner can always read their own profile
    auth.uid() = user_profiles.user_id

    -- Studio admins can read profiles for users who have enrollments in their studio
    OR EXISTS (
      SELECT 1
      FROM public.inschrijvingen i
      JOIN public.programs p ON p.id = i.program_id
      JOIN public.user_roles ur ON ur.studio_id = p.studio_id
      WHERE i.user_id = user_profiles.user_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'studio_admin'
    )

    -- Studio admins can also read profiles when there is a pending invitation for that email
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur2
      WHERE ur2.user_id = auth.uid()
        AND ur2.role = 'studio_admin'
        AND EXISTS (
          SELECT 1
          FROM public.pending_teacher_invitations pti
          WHERE lower(pti.email) = lower(user_profiles.email)
            AND pti.studio_id = ur2.studio_id
        )
    )
  );

COMMIT;

-- End migration
