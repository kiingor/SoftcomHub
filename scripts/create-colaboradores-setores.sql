-- Create colaboradores_setores junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS colaboradores_setores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  setor_id UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(colaborador_id, setor_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_colaboradores_setores_colaborador ON colaboradores_setores(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_setores_setor ON colaboradores_setores(setor_id);

-- Migrate existing data: if colaboradores have setor_id, create entries in the junction table
INSERT INTO colaboradores_setores (colaborador_id, setor_id)
SELECT id, setor_id FROM colaboradores WHERE setor_id IS NOT NULL
ON CONFLICT (colaborador_id, setor_id) DO NOTHING;

-- Enable RLS
ALTER TABLE colaboradores_setores ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow authenticated read colaboradores_setores" ON colaboradores_setores
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert colaboradores_setores" ON colaboradores_setores
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated delete colaboradores_setores" ON colaboradores_setores
  FOR DELETE TO authenticated USING (true);
