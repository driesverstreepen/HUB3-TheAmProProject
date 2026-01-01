-- AmPro: optional house number addition for addresses

ALTER TABLE public.ampro_dancer_profiles
  ADD COLUMN IF NOT EXISTS house_number_addition text;
