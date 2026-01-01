-- Migration 100: Promo cards (configurable by super_admin)
--
-- Stores promo card content per interface (user/studio).
-- Not dismissible by end users (no per-user state).

CREATE TABLE IF NOT EXISTS public.promo_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interface text NOT NULL CHECK (interface IN ('user', 'studio')),
  is_visible boolean NOT NULL DEFAULT false,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  button_label text NULL,
  button_href text NULL,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_cards_interface_unique UNIQUE (interface)
);

ALTER TABLE public.promo_cards ENABLE ROW LEVEL SECURITY;

-- Everyone logged in can read promo config
DROP POLICY IF EXISTS promo_cards_select_authenticated ON public.promo_cards;
CREATE POLICY promo_cards_select_authenticated
  ON public.promo_cards
  FOR SELECT
  TO authenticated
  USING (true);

-- Only super_admin can manage
DROP POLICY IF EXISTS promo_cards_manage_super_admin ON public.promo_cards;
CREATE POLICY promo_cards_manage_super_admin
  ON public.promo_cards
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
  );

-- Keep one row per interface (idempotent)
INSERT INTO public.promo_cards (interface, is_visible, title, description, button_label, button_href)
SELECT 'user', false, 'Future features', 'Stem op nieuwe ontwikkelingen voor HUB3.', 'Bekijk & stem', '/future-features'
WHERE NOT EXISTS (SELECT 1 FROM public.promo_cards WHERE interface = 'user');

-- Note: for studio routes you can use {studioId} placeholder in button_href, e.g. /studio/{studioId}/future-features
INSERT INTO public.promo_cards (interface, is_visible, title, description, button_label, button_href)
SELECT 'studio', false, 'Future features', 'Stem op nieuwe ontwikkelingen voor HUB3.', 'Bekijk & stem', '/studio/{studioId}/future-features'
WHERE NOT EXISTS (SELECT 1 FROM public.promo_cards WHERE interface = 'studio');
