-- Add enrollment_id to evaluations to support per-enrollment evaluations
BEGIN;

ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS enrollment_id uuid NULL;

-- Optional: add a foreign key to inschrijvingen(id) if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'inschrijvingen'
  ) THEN
    -- Ensure inschrijvingen.id is uuid; if not, adjust type cast accordingly
    ALTER TABLE evaluations
      ADD CONSTRAINT evaluations_enrollment_fk
      FOREIGN KEY (enrollment_id)
      REFERENCES inschrijvingen(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Helpful index for lookups by enrollment
CREATE INDEX IF NOT EXISTS idx_evaluations_enrollment_id ON evaluations(enrollment_id);

COMMIT;