-- Tabela para armazenar os setores de atendimento por canal
CREATE TABLE IF NOT EXISTS canal_tipos_atendimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id uuid NOT NULL REFERENCES setor_canais(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('suporte', 'ouvidoria', 'financeiro', 'implantacao')),
  setor_id uuid NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  criado_em timestamp with time zone DEFAULT now(),
  UNIQUE(canal_id, tipo)
);

-- Index para busca rapida por canal_id
CREATE INDEX IF NOT EXISTS idx_canal_tipos_atendimento_canal_id ON canal_tipos_atendimento(canal_id);

-- Enable RLS
ALTER TABLE canal_tipos_atendimento ENABLE ROW LEVEL SECURITY;

-- Policy para acesso
CREATE POLICY "Allow all access to canal_tipos_atendimento" ON canal_tipos_atendimento FOR ALL USING (true);
