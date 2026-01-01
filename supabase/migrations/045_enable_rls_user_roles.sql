-- 045_enable_rls_user_roles.sql
-- Enable Row Level Security on public.user_roles safely.
-- Strategy:
-- 1. Create a small helper table `public.admin_users` to list super-admin accounts (no recursion).
-- 2. Seed `admin_users` from any existing `user_roles` rows with role = 'super_admin'.
-- 3. Enable RLS on `public.user_roles`.
-- 4. Add policies that allow:
--    - users to manage only their own role row
--    - super admins (as listed in public.admin_users) to read/update/insert/delete any row
-- Run this as a SUPABASE SQL Editor admin (or using the service_role key).

-- 1) helper table for admin lookups (different table -> avoids recursive policy lookups)
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY,
  is_super boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- 2) seed admin_users from existing user_roles
-- If you already restored user_roles manually, this copies those super_admin entries.
INSERT INTO public.admin_users (user_id, is_super)
SELECT user_id, true
FROM public.user_roles
WHERE role = 'super_admin'
ON CONFLICT (user_id) DO NOTHING;

-- 3) Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4) Policies
-- Allow users to SELECT their own row or allow super admins (from admin_users)
CREATE POLICY user_roles_select_own_or_super
  ON public.user_roles
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_super = true)
  );

-- Allow users to INSERT only for themselves, or super admins to insert any
CREATE POLICY user_roles_insert_own_or_super
  ON public.user_roles
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_super = true)
  );

-- Allow users to UPDATE their own row, or super admins to update any
CREATE POLICY user_roles_update_own_or_super
  ON public.user_roles
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_super = true)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_super = true)
  );

-- Allow users to DELETE their own row, or super admins to delete any
CREATE POLICY user_roles_delete_own_or_super
  ON public.user_roles
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_super = true)
  );

-- Optional: a helper view to list admins (for debugging)
CREATE OR REPLACE VIEW public.admins AS
SELECT a.user_id, a.is_super, u.email
FROM public.admin_users a
LEFT JOIN auth.users u ON u.id = a.user_id;

-- Optional: keep admin_users in sync via trigger (simple approach)
-- This trigger updates admin_users when a user_roles row with role='super_admin' is inserted/updated/deleted.
-- It runs with table owner privileges so it bypasses RLS; run this as an admin.

CREATE OR REPLACE FUNCTION public.sync_admin_users() RETURNS trigger AS $$
BEGIN
  -- If a super_admin row was inserted or updated to super_admin, ensure entry exists
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF (NEW.role = 'super_admin') THEN
      INSERT INTO public.admin_users (user_id, is_super, created_at)
      VALUES (NEW.user_id, true, now())
      ON CONFLICT (user_id) DO UPDATE SET is_super = true;
    ELSE
      -- if role changed away from super_admin, remove from admin_users
      DELETE FROM public.admin_users WHERE user_id = NEW.user_id AND is_super = true;
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    -- if deleted row was super_admin, remove
    IF (OLD.role = 'super_admin') THEN
      DELETE FROM public.admin_users WHERE user_id = OLD.user_id AND is_super = true;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to user_roles
DROP TRIGGER IF EXISTS trg_sync_admin_users ON public.user_roles;
CREATE TRIGGER trg_sync_admin_users
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_users();

-- End of migration

-- Notes:
-- - After running this migration, `public.admin_users` will be used to mark super admins.
-- - For more advanced role-checking (e.g. studio_admin that can act within a studio), you can add a table
--   like public.studio_admins(studio_id uuid, user_id uuid) and expand the policies to check membership.
-- - Use the Supabase service_role key for server-side admin APIs that need to bypass RLS; do not expose it to clients.
