-- Evaluations System Migration
-- Run this migration to add evaluations/feedback functionality

-- Evaluations table
CREATE TABLE IF NOT EXISTS evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  program_id uuid REFERENCES programs(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  user_id uuid NOT NULL,
  score integer CHECK (score >= 1 AND score <= 10),
  criteria jsonb DEFAULT '{}',
  comment text,
  visibility_status text NOT NULL DEFAULT 'hidden' CHECK (visibility_status IN ('hidden', 'visible_immediate', 'visible_on_date')),
  visible_from timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  edited_by uuid,
  deleted boolean DEFAULT false,
  CONSTRAINT fk_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_edited_by FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Studio evaluation settings
CREATE TABLE IF NOT EXISTS studio_evaluation_settings (
  studio_id uuid PRIMARY KEY REFERENCES studios(id) ON DELETE CASCADE,
  enabled boolean DEFAULT false,
  default_visibility text DEFAULT 'hidden' CHECK (default_visibility IN ('hidden', 'visible_immediate', 'visible_on_date')),
  editable_after_publish_days integer DEFAULT 7,
  allow_teachers_edit boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_evaluations_studio_id ON evaluations(studio_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_user_id ON evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_teacher_id ON evaluations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_program_id ON evaluations(program_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_visibility ON evaluations(visibility_status, visible_from);
CREATE INDEX IF NOT EXISTS idx_evaluations_created_at ON evaluations(created_at DESC);

-- RLS Policies (Row Level Security)
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_evaluation_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Studio admins can see all evaluations in their studio
CREATE POLICY evaluations_admin_all ON evaluations
  FOR ALL
  USING (
    studio_id IN (
      SELECT studio_id FROM user_roles 
      WHERE user_id = auth.uid() AND role IN ('studio_admin', 'admin')
    )
  );

-- Policy: Teachers can manage evaluations they created
CREATE POLICY evaluations_teacher_own ON evaluations
  FOR ALL
  USING (
    teacher_id = auth.uid() 
    AND studio_id IN (
      SELECT studio_id FROM studio_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can view their own evaluations (when visible)
CREATE POLICY evaluations_user_view ON evaluations
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND deleted = false
    AND (
      visibility_status = 'visible_immediate'
      OR (visibility_status = 'visible_on_date' AND visible_from <= now())
    )
  );

-- Policy: Studio admins can manage settings
CREATE POLICY eval_settings_admin ON studio_evaluation_settings
  FOR ALL
  USING (
    studio_id IN (
      SELECT studio_id FROM user_roles 
      WHERE user_id = auth.uid() AND role IN ('studio_admin', 'admin')
    )
  );

-- Comments for documentation
COMMENT ON TABLE evaluations IS 'Stores teacher evaluations/feedback for users';
COMMENT ON TABLE studio_evaluation_settings IS 'Per-studio settings for evaluation feature';
COMMENT ON COLUMN evaluations.criteria IS 'JSON object with custom evaluation criteria, e.g. {"technique": 5, "expression": 4}';
COMMENT ON COLUMN evaluations.visibility_status IS 'Controls when user can see the evaluation: hidden, visible_immediate, or visible_on_date';
