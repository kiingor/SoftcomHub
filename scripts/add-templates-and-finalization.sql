-- Add finalization message to setores
ALTER TABLE setores ADD COLUMN IF NOT EXISTS mensagem_finalizacao TEXT;

-- Create templates table
CREATE TABLE IF NOT EXISTS templates_mensagem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  atalho TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(setor_id, atalho)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_templates_setor ON templates_mensagem(setor_id);
CREATE INDEX IF NOT EXISTS idx_templates_atalho ON templates_mensagem(atalho);

-- Enable realtime for templates
ALTER PUBLICATION supabase_realtime ADD TABLE templates_mensagem;
