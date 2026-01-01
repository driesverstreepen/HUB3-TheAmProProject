-- Migration 095: Super admin audit log + soft-delete fields on user_profiles

BEGIN;

-- Audit log table
CREATE TABLE IF NOT EXISTS public.super_admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID NOT NULL,
  target_user_id UUID,
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_actor ON public.super_admin_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_target ON public.super_admin_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_created_at ON public.super_admin_audit_log(created_at);

-- Soft delete fields on user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'deleted_by'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN deleted_by UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'deleted_reason'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN deleted_reason TEXT;
  END IF;
END$$;

COMMIT;
