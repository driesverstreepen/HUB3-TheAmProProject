-- Migration 108: Allow studio members (any role) to read operational studio data
-- Goal: when a user is added to a studio profile, RLS should not block read access for core studio pages.

-- Uses helper public.is_studio_member(target_studio_id uuid) introduced in migration 107.

-- Programs
DO $$
BEGIN
  IF to_regclass('public.programs') IS NOT NULL THEN
    DROP POLICY IF EXISTS programs_select_studio_members ON public.programs;

    CREATE POLICY programs_select_studio_members
      ON public.programs
      FOR SELECT
      TO authenticated
      USING (public.is_studio_member(studio_id));
  END IF;
END $$;

-- Lessons (join via program_id for compatibility)
DO $$
BEGIN
  IF to_regclass('public.lessons') IS NOT NULL THEN
    DROP POLICY IF EXISTS lessons_select_studio_members ON public.lessons;

    CREATE POLICY lessons_select_studio_members
      ON public.lessons
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = lessons.program_id
            AND public.is_studio_member(p.studio_id)
        )
      );
  END IF;
END $$;

-- Enrollments (inschrijvingen)
DO $$
BEGIN
  IF to_regclass('public.inschrijvingen') IS NOT NULL THEN
    DROP POLICY IF EXISTS inschrijvingen_select_studio_members ON public.inschrijvingen;

    CREATE POLICY inschrijvingen_select_studio_members
      ON public.inschrijvingen
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = inschrijvingen.program_id
            AND public.is_studio_member(p.studio_id)
        )
      );
  END IF;
END $$;

-- Program locations
DO $$
BEGIN
  IF to_regclass('public.program_locations') IS NOT NULL THEN
    DROP POLICY IF EXISTS program_locations_select_studio_members ON public.program_locations;

    CREATE POLICY program_locations_select_studio_members
      ON public.program_locations
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = program_locations.program_id
            AND public.is_studio_member(p.studio_id)
        )
      );
  END IF;
END $$;

-- Lesson attendances
DO $$
BEGIN
  IF to_regclass('public.lesson_attendances') IS NOT NULL THEN
    DROP POLICY IF EXISTS lesson_attendances_select_studio_members ON public.lesson_attendances;

    CREATE POLICY lesson_attendances_select_studio_members
      ON public.lesson_attendances
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.programs p
          WHERE p.id = lesson_attendances.program_id
            AND public.is_studio_member(p.studio_id)
        )
      );
  END IF;
END $$;

-- Lesson absences (join via lesson -> program)
DO $$
BEGIN
  IF to_regclass('public.lesson_absences') IS NOT NULL THEN
    DROP POLICY IF EXISTS lesson_absences_select_studio_members ON public.lesson_absences;

    CREATE POLICY lesson_absences_select_studio_members
      ON public.lesson_absences
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.lessons l
          JOIN public.programs p ON p.id = l.program_id
          WHERE l.id = lesson_absences.lesson_id
            AND public.is_studio_member(p.studio_id)
        )
      );
  END IF;
END $$;

-- Replacement requests
DO $$
BEGIN
  IF to_regclass('public.replacement_requests') IS NOT NULL THEN
    ALTER TABLE public.replacement_requests ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS replacement_requests_select_studio_members ON public.replacement_requests;

    CREATE POLICY replacement_requests_select_studio_members
      ON public.replacement_requests
      FOR SELECT
      TO authenticated
      USING (public.is_studio_member(studio_id));
  END IF;
END $$;

-- User profiles: allow studio members to see profiles for users connected to their studio
-- (e.g. enrollments / members lists). Keeps existing owner/self policies intact.
DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Studio members can view user profiles" ON public.user_profiles;

    CREATE POLICY "Studio members can view user profiles"
      ON public.user_profiles
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.inschrijvingen i
          JOIN public.programs p ON p.id = i.program_id
          WHERE i.user_id = user_profiles.user_id
            AND public.is_studio_member(p.studio_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.studio_members sm
          WHERE sm.user_id = user_profiles.user_id
            AND public.is_studio_member(sm.studio_id)
        )
      );
  END IF;
END $$;
