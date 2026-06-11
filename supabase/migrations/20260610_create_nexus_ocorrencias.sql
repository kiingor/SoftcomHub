-- Registra quando o Nexus abriu uma ocorrencia em sistema externo.
-- O painel /dashboard/nexus usa este sinal para finalizar a monitoria sem ticket.

CREATE TABLE IF NOT EXISTS nexus_ocorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  telefone TEXT,
  nome_cliente TEXT,
  setor_id UUID REFERENCES setores(id) ON DELETE SET NULL,
  ocorrencia_id TEXT,
  protocolo TEXT,
  status TEXT NOT NULL DEFAULT 'aberta',
  origem TEXT NOT NULL DEFAULT 'nexus',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nexus_ocorrencias_cliente_id
  ON nexus_ocorrencias(cliente_id);

CREATE INDEX IF NOT EXISTS idx_nexus_ocorrencias_telefone
  ON nexus_ocorrencias(telefone);

CREATE INDEX IF NOT EXISTS idx_nexus_ocorrencias_criado_em
  ON nexus_ocorrencias(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_nexus_ocorrencias_status
  ON nexus_ocorrencias(status);
