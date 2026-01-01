-- 070_add_lesson_absences_delete_policy.sql
-- Adds DELETE policy for lesson_absences table to allow users to remove their own absences.

-- Allow authenticated users to delete their own absence records
DROP POLICY IF EXISTS lesson_absences_delete_own ON public.lesson_absences;
CREATE POLICY lesson_absences_delete_own ON public.lesson_absences
  FOR DELETE
  USING (user_id = auth.uid());