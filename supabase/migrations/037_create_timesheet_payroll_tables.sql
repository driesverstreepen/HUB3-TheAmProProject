-- Migration 037: Create Timesheet & Payroll tables
-- This migration creates the infrastructure for teacher compensation tracking

-- 1. Create teacher_compensation table
-- Stores compensation settings per teacher per studio
CREATE TABLE IF NOT EXISTS public.teacher_compensation (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_fee numeric(10,2) NOT NULL DEFAULT 0.00,
  transport_fee numeric(10,2) NOT NULL DEFAULT 0.00,
  payment_method text NOT NULL CHECK (payment_method IN ('factuur', 'vrijwilligersvergoeding', 'verenigingswerk', 'akv')) DEFAULT 'factuur',
  active boolean DEFAULT true,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(studio_id, teacher_id)
);

-- 2. Create timesheets table
-- Main timesheet per teacher per month
CREATE TABLE IF NOT EXISTS public.timesheets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  year integer NOT NULL CHECK (year >= 2000),
  status text NOT NULL CHECK (status IN ('draft', 'confirmed')) DEFAULT 'draft',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  confirmed_at timestamp with time zone,
  confirmed_by uuid REFERENCES auth.users(id),
  notes text,
  UNIQUE(studio_id, teacher_id, month, year)
);

-- 3. Create timesheet_entries table
-- Individual lesson entries in a timesheet
CREATE TABLE IF NOT EXISTS public.timesheet_entries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id uuid NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  date date NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 0,
  lesson_fee numeric(10,2) NOT NULL DEFAULT 0.00,
  transport_fee numeric(10,2) NOT NULL DEFAULT 0.00,
  is_manual boolean DEFAULT false,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 4. Create payrolls table
-- Generated from confirmed timesheets
CREATE TABLE IF NOT EXISTS public.payrolls (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id uuid NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month integer NOT NULL,
  year integer NOT NULL,
  total_lessons integer NOT NULL DEFAULT 0,
  total_hours numeric(10,2) NOT NULL DEFAULT 0.00,
  total_lesson_fees numeric(10,2) NOT NULL DEFAULT 0.00,
  total_transport_fees numeric(10,2) NOT NULL DEFAULT 0.00,
  total_amount numeric(10,2) NOT NULL DEFAULT 0.00,
  payment_method text NOT NULL,
  payment_status text NOT NULL CHECK (payment_status IN ('pending', 'paid')) DEFAULT 'pending',
  paid_at timestamp with time zone,
  paid_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  UNIQUE(timesheet_id)
);

-- 5. Create timesheet_comments table
-- Allows teachers to leave comments on their timesheets
CREATE TABLE IF NOT EXISTS public.timesheet_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id uuid NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_teacher_compensation_studio ON public.teacher_compensation(studio_id);
CREATE INDEX IF NOT EXISTS idx_teacher_compensation_teacher ON public.teacher_compensation(teacher_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_studio ON public.timesheets(studio_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_teacher ON public.timesheets(teacher_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_month_year ON public.timesheets(month, year);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_timesheet ON public.timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_lesson ON public.timesheet_entries(lesson_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_date ON public.timesheet_entries(date);
CREATE INDEX IF NOT EXISTS idx_payrolls_studio ON public.payrolls(studio_id);
CREATE INDEX IF NOT EXISTS idx_payrolls_teacher ON public.payrolls(teacher_id);
CREATE INDEX IF NOT EXISTS idx_payrolls_timesheet ON public.payrolls(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_comments_timesheet ON public.timesheet_comments(timesheet_id);

-- Add RLS policies

-- Teacher Compensation policies
ALTER TABLE public.teacher_compensation ENABLE ROW LEVEL SECURITY;

-- Studio admins can view and manage compensation for their teachers
DROP POLICY IF EXISTS teacher_compensation_admin_all ON public.teacher_compensation;
CREATE POLICY teacher_compensation_admin_all ON public.teacher_compensation
  FOR ALL
  TO authenticated
  USING (
    studio_id IN (
      SELECT studio_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  )
  WITH CHECK (
    studio_id IN (
      SELECT studio_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  );

-- Teachers can view their own compensation settings
DROP POLICY IF EXISTS teacher_compensation_teacher_view ON public.teacher_compensation;
CREATE POLICY teacher_compensation_teacher_view ON public.teacher_compensation
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

-- Timesheets policies
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;

-- Studio admins can manage timesheets for their studio
DROP POLICY IF EXISTS timesheets_admin_all ON public.timesheets;
CREATE POLICY timesheets_admin_all ON public.timesheets
  FOR ALL
  USING (
    studio_id IN (
      SELECT studio_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  )
  WITH CHECK (
    studio_id IN (
      SELECT studio_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  );

-- Teachers can view their own timesheets
DROP POLICY IF EXISTS timesheets_teacher_view ON public.timesheets;
CREATE POLICY timesheets_teacher_view ON public.timesheets
  FOR SELECT
  USING (teacher_id = auth.uid());

-- Timesheet Entries policies
ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;

-- Studio admins can manage entries for timesheets in their studio
DROP POLICY IF EXISTS timesheet_entries_admin_all ON public.timesheet_entries;
CREATE POLICY timesheet_entries_admin_all ON public.timesheet_entries
  FOR ALL
  USING (
    timesheet_id IN (
      SELECT id FROM public.timesheets
      WHERE studio_id IN (
        SELECT studio_id FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'studio_admin'
      )
    )
  )
  WITH CHECK (
    timesheet_id IN (
      SELECT id FROM public.timesheets
      WHERE studio_id IN (
        SELECT studio_id FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'studio_admin'
      )
    )
  );

-- Teachers can view entries for their own timesheets
DROP POLICY IF EXISTS timesheet_entries_teacher_view ON public.timesheet_entries;
CREATE POLICY timesheet_entries_teacher_view ON public.timesheet_entries
  FOR SELECT
  USING (
    timesheet_id IN (
      SELECT id FROM public.timesheets
      WHERE teacher_id = auth.uid()
    )
  );

-- Payrolls policies
ALTER TABLE public.payrolls ENABLE ROW LEVEL SECURITY;

-- Studio admins can manage payrolls for their studio
DROP POLICY IF EXISTS payrolls_admin_all ON public.payrolls;
CREATE POLICY payrolls_admin_all ON public.payrolls
  FOR ALL
  USING (
    studio_id IN (
      SELECT studio_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  )
  WITH CHECK (
    studio_id IN (
      SELECT studio_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'studio_admin'
    )
  );

-- Teachers can view their own payrolls
DROP POLICY IF EXISTS payrolls_teacher_view ON public.payrolls;
CREATE POLICY payrolls_teacher_view ON public.payrolls
  FOR SELECT
  USING (teacher_id = auth.uid());

-- Timesheet Comments policies
ALTER TABLE public.timesheet_comments ENABLE ROW LEVEL SECURITY;

-- Studio admins can view comments on timesheets in their studio
DROP POLICY IF EXISTS timesheet_comments_admin_view ON public.timesheet_comments;
CREATE POLICY timesheet_comments_admin_view ON public.timesheet_comments
  FOR SELECT
  USING (
    timesheet_id IN (
      SELECT id FROM public.timesheets
      WHERE studio_id IN (
        SELECT studio_id FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'studio_admin'
      )
    )
  );

-- Teachers can view and create comments on their own timesheets
DROP POLICY IF EXISTS timesheet_comments_teacher_view ON public.timesheet_comments;
CREATE POLICY timesheet_comments_teacher_view ON public.timesheet_comments
  FOR SELECT
  USING (
    timesheet_id IN (
      SELECT id FROM public.timesheets
      WHERE teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS timesheet_comments_teacher_insert ON public.timesheet_comments;
CREATE POLICY timesheet_comments_teacher_insert ON public.timesheet_comments
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    timesheet_id IN (
      SELECT id FROM public.timesheets
      WHERE teacher_id = auth.uid()
    )
  );

-- Add table comments for documentation
COMMENT ON TABLE public.teacher_compensation IS 'Stores compensation settings (fees and payment method) per teacher per studio';
COMMENT ON TABLE public.timesheets IS 'Monthly timesheets for teachers, tracking their lessons';
COMMENT ON TABLE public.timesheet_entries IS 'Individual lesson entries within a timesheet';
COMMENT ON TABLE public.payrolls IS 'Calculated payrolls based on confirmed timesheets';
COMMENT ON TABLE public.timesheet_comments IS 'Comments that teachers can leave on their timesheets';
