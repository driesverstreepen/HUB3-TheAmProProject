-- Migration: Create studio_teachers junction table for many-to-many teacher-studio relationships
-- A teacher can be linked to multiple studios
-- When a teacher is removed from their last studio, their role should be downgraded to 'user'

-- 1. Create studio_teachers junction table
CREATE TABLE IF NOT EXISTS public.studio_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  added_by UUID REFERENCES auth.users(id), -- studio admin who added them
  UNIQUE(user_id, studio_id) -- prevent duplicate links
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_studio_teachers_user ON public.studio_teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_teachers_studio ON public.studio_teachers(studio_id);

-- Enable RLS
ALTER TABLE public.studio_teachers ENABLE ROW LEVEL SECURITY;

-- Policy: Studio admins can manage teachers for their studio
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'studio_teachers_admin_manage'
      AND polrelid = 'public.studio_teachers'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY studio_teachers_admin_manage ON public.studio_teachers FOR ALL USING ( EXISTS ( SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ''studio_admin'' AND user_roles.studio_id = studio_teachers.studio_id ) );';
  END IF;
END$$;

-- Policy: Teachers can view their own studio links
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'studio_teachers_view_own'
      AND polrelid = 'public.studio_teachers'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY studio_teachers_view_own ON public.studio_teachers FOR SELECT USING (user_id = auth.uid());';
  END IF;
END$$;

-- Policy: Service role bypass (for API routes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polname = 'studio_teachers_service_role'
      AND polrelid = 'public.studio_teachers'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY studio_teachers_service_role ON public.studio_teachers FOR ALL USING (true) WITH CHECK (true);';
  END IF;
END$$;

-- 2. Function to automatically update user_roles.role based on studio_teachers links
CREATE OR REPLACE FUNCTION public.sync_teacher_role()
RETURNS TRIGGER AS $$
DECLARE
  link_count INTEGER;
BEGIN
  -- Count how many studio links this user has
  SELECT COUNT(*) INTO link_count
  FROM public.studio_teachers
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);

  -- Update user_roles based on link count
  IF link_count > 0 THEN
    -- User has at least one studio link -> should be teacher
    -- Try to update existing user_roles row first
    UPDATE public.user_roles
    SET role = 'teacher'
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND role != 'studio_admin' -- don't overwrite studio admins
      AND role != 'super_admin'; -- don't overwrite super admins

    -- If no row existed, insert one with role 'teacher'. Use ON CONFLICT to avoid races
    INSERT INTO public.user_roles (user_id, role, studio_id, created_at, updated_at)
    VALUES (COALESCE(NEW.user_id, OLD.user_id), 'teacher', NULL, now(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET role = EXCLUDED.role
    WHERE public.user_roles.role NOT IN ('studio_admin', 'super_admin');
  ELSE
    -- User has no studio links -> downgrade to user
    UPDATE public.user_roles
    SET role = 'user', studio_id = NULL
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
    AND role = 'teacher'; -- only downgrade teachers
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Triggers to sync role when studio_teachers changes
DROP TRIGGER IF EXISTS sync_teacher_role_on_insert ON public.studio_teachers;
CREATE TRIGGER sync_teacher_role_on_insert
AFTER INSERT ON public.studio_teachers
FOR EACH ROW
EXECUTE FUNCTION public.sync_teacher_role();

DROP TRIGGER IF EXISTS sync_teacher_role_on_delete ON public.studio_teachers;
CREATE TRIGGER sync_teacher_role_on_delete
AFTER DELETE ON public.studio_teachers
FOR EACH ROW
EXECUTE FUNCTION public.sync_teacher_role();

-- 4. Migrate existing data if any
-- If user_roles has studio_id set and role='teacher', create a studio_teachers link
INSERT INTO public.studio_teachers (user_id, studio_id, added_at)
SELECT user_id, studio_id, created_at
FROM public.user_roles
WHERE role = 'teacher' 
  AND studio_id IS NOT NULL
ON CONFLICT (user_id, studio_id) DO NOTHING;

-- Comment for clarity
COMMENT ON TABLE public.studio_teachers IS 'Junction table for many-to-many relationship between teachers and studios. A teacher can be linked to multiple studios.';
COMMENT ON FUNCTION public.sync_teacher_role() IS 'Automatically updates user_roles.role to teacher when studio link is added, downgrades to user when last studio link is removed.';
