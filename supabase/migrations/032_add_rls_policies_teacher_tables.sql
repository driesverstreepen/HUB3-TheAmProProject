-- Migration: Add RLS policies for teacher-related tables
-- Ensures proper access control for notifications, invitations, lesson attendance, and teacher programs

-- ============================================================================
-- 1. NOTIFICATIONS TABLE
-- ============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
DROP POLICY IF EXISTS notifications_view_own ON public.notifications;
CREATE POLICY notifications_view_own ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Studio admins can insert notifications for users in their studio
DROP POLICY IF EXISTS notifications_studio_admin_insert ON public.notifications;
CREATE POLICY notifications_studio_admin_insert ON public.notifications
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
    )
  );

-- ============================================================================
-- 2. PENDING_TEACHER_INVITATIONS TABLE
-- ============================================================================
ALTER TABLE public.pending_teacher_invitations ENABLE ROW LEVEL SECURITY;

-- Studio admins can view invitations for their studio
DROP POLICY IF EXISTS pending_invitations_studio_admin_view ON public.pending_teacher_invitations;
CREATE POLICY pending_invitations_studio_admin_view ON public.pending_teacher_invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = pending_teacher_invitations.studio_id
    )
  );

-- Studio admins can insert invitations for their studio
DROP POLICY IF EXISTS pending_invitations_studio_admin_insert ON public.pending_teacher_invitations;
CREATE POLICY pending_invitations_studio_admin_insert ON public.pending_teacher_invitations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = pending_teacher_invitations.studio_id
    )
  );

-- Studio admins can update/delete invitations for their studio
DROP POLICY IF EXISTS pending_invitations_studio_admin_manage ON public.pending_teacher_invitations;
CREATE POLICY pending_invitations_studio_admin_manage ON public.pending_teacher_invitations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = pending_teacher_invitations.studio_id
    )
  );

-- Allow signup flow to read pending invitations by email (for creating notifications)
DROP POLICY IF EXISTS pending_invitations_read_by_email ON public.pending_teacher_invitations;
CREATE POLICY pending_invitations_read_by_email ON public.pending_teacher_invitations
  FOR SELECT
  USING (
    email IN (
      SELECT email FROM auth.users WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- 3. TEACHER_PROGRAMS TABLE
-- ============================================================================
ALTER TABLE public.teacher_programs ENABLE ROW LEVEL SECURITY;

-- Teachers can view programs they are assigned to
DROP POLICY IF EXISTS teacher_programs_view_own ON public.teacher_programs;
CREATE POLICY teacher_programs_view_own ON public.teacher_programs
  FOR SELECT
  USING (teacher_id = auth.uid());

-- Studio admins can manage teacher-program assignments for their studio
DROP POLICY IF EXISTS teacher_programs_studio_admin_manage ON public.teacher_programs;
CREATE POLICY teacher_programs_studio_admin_manage ON public.teacher_programs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
      AND user_roles.studio_id = teacher_programs.studio_id
    )
  );

-- ============================================================================
-- 4. LESSON_ATTENDANCES TABLE
-- ============================================================================
ALTER TABLE public.lesson_attendances ENABLE ROW LEVEL SECURITY;

-- Teachers can view attendance for their own programs
DROP POLICY IF EXISTS lesson_attendance_teacher_view ON public.lesson_attendances;
CREATE POLICY lesson_attendance_teacher_view ON public.lesson_attendances
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teacher_programs
      WHERE teacher_programs.teacher_id = auth.uid()
      AND teacher_programs.program_id = lesson_attendances.program_id
    )
  );

-- Teachers can mark attendance for their own programs
DROP POLICY IF EXISTS lesson_attendance_teacher_mark ON public.lesson_attendances;
CREATE POLICY lesson_attendance_teacher_mark ON public.lesson_attendances
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.teacher_programs
      WHERE teacher_programs.teacher_id = auth.uid()
      AND teacher_programs.program_id = lesson_attendances.program_id
    )
  );

-- Studio admins can view all attendance for their studio's programs
DROP POLICY IF EXISTS lesson_attendance_admin_view ON public.lesson_attendances;
CREATE POLICY lesson_attendance_admin_view ON public.lesson_attendances
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.programs
      JOIN public.user_roles ON user_roles.studio_id = programs.studio_id
      WHERE programs.id = lesson_attendances.program_id
      AND user_roles.user_id = auth.uid()
      AND user_roles.role = 'studio_admin'
    )
  );

-- Students can view their own attendance
DROP POLICY IF EXISTS lesson_attendance_student_view_own ON public.lesson_attendances;
CREATE POLICY lesson_attendance_student_view_own ON public.lesson_attendances
  FOR SELECT
  USING (user_id = auth.uid());

-- Add comments for documentation
COMMENT ON POLICY notifications_view_own ON public.notifications IS 'Users can view their own notifications';
COMMENT ON POLICY pending_invitations_studio_admin_view ON public.pending_teacher_invitations IS 'Studio admins can view and manage teacher invitations for their studio';
COMMENT ON POLICY teacher_programs_view_own ON public.teacher_programs IS 'Teachers can view their own program assignments';
COMMENT ON POLICY lesson_attendance_teacher_view ON public.lesson_attendances IS 'Teachers can view and mark attendance for their assigned programs';
