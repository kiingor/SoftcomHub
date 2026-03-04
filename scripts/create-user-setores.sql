-- Table for user-sector permissions (which sectors a user can access)
CREATE TABLE IF NOT EXISTS colaborador_setores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  setor_id UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(colaborador_id, setor_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_colaborador_setores_colaborador ON colaborador_setores(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_colaborador_setores_setor ON colaborador_setores(setor_id);

-- Add is_master column to colaboradores (master users see all sectors)
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false;

-- Add icon_url and color to setores for the cards
ALTER TABLE setores ADD COLUMN IF NOT EXISTS icon_url TEXT;
ALTER TABLE setores ADD COLUMN IF NOT EXISTS cor TEXT DEFAULT '#3B82F6';
