-- Enable Super Admin User Management by default

INSERT INTO public.global_feature_flags (key, enabled, hidden, coming_soon_label, updated_at, updated_by)
VALUES ('super-admin.users', true, false, NULL, now(), NULL)
ON CONFLICT (key) DO UPDATE
SET enabled = EXCLUDED.enabled,
    hidden = false,
    updated_at = now();
