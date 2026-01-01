-- 055_create_site_settings_table.sql
-- Create a simple table to hold site-wide settings editable by super_admin

BEGIN;

CREATE TABLE IF NOT EXISTS public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url text NULL,
  support_email text NULL,
  welcome_content text NULL,
  created_by uuid NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure an initial row exists (idempotent): insert if empty
INSERT INTO public.site_settings (logo_url, support_email, welcome_content)
SELECT NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.site_settings);

COMMIT;
