ALTER TABLE public.carts
DROP CONSTRAINT IF EXISTS carts_status_check;

ALTER TABLE public.carts
ADD CONSTRAINT carts_status_check CHECK (status IN ('active', 'completed', 'expired', 'pending_payment'));
