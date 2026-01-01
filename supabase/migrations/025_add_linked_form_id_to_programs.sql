-- Add linked_form_id column to programs table
-- Allows linking programs to enrollment forms
ALTER TABLE programs
ADD COLUMN linked_form_id UUID REFERENCES forms(id) ON DELETE SET NULL;

-- Add comment for clarity
COMMENT ON COLUMN programs.linked_form_id IS 'Optional reference to a form that users must fill out when enrolling in this program';

-- Optional: Create index for performance
CREATE INDEX idx_programs_linked_form_id ON programs(linked_form_id);