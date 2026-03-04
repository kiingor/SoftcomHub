-- Tabela para configurar destinos de transferência de tickets por setor
-- Cada registro define que o setor_origem pode transferir tickets para setor_destino

CREATE TABLE IF NOT EXISTS setor_destinos_transferencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_origem_id uuid NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  setor_destino_id uuid NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  criado_em timestamptz DEFAULT now(),
  UNIQUE (setor_origem_id, setor_destino_id)
);

-- Índices para consulta eficiente
CREATE INDEX IF NOT EXISTS idx_sdt_origem ON setor_destinos_transferencia (setor_origem_id);
CREATE INDEX IF NOT EXISTS idx_sdt_destino ON setor_destinos_transferencia (setor_destino_id);

-- RLS
ALTER TABLE setor_destinos_transferencia ENABLE ROW LEVEL SECURITY;

-- Política: usuários autenticados podem ler
CREATE POLICY "Autenticados podem ler destinos de transferencia"
  ON setor_destinos_transferencia FOR SELECT
  TO authenticated
  USING (true);

-- Política: usuários autenticados podem inserir/deletar (gerenciamento via app)
CREATE POLICY "Autenticados podem gerenciar destinos de transferencia"
  ON setor_destinos_transferencia FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
