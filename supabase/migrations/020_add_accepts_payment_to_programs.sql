-- Add accepts_payment column to programs table
-- Default is FALSE (gratis) - studio admins can enable payments per program
ALTER TABLE programs 
ADD COLUMN accepts_payment BOOLEAN NOT NULL DEFAULT FALSE;

-- Add comment for clarity
COMMENT ON COLUMN programs.accepts_payment IS 'Whether this program requires payment via Stripe. FALSE = gratis (free enrollment), TRUE = paid (Stripe checkout required)';

-- Optional: Create index if we'll query by payment status frequently
CREATE INDEX idx_programs_accepts_payment ON programs(accepts_payment);
