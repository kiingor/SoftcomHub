-- Create notificacoes table
CREATE TABLE IF NOT EXISTS notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  remetente_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  destinatario_id UUID REFERENCES colaboradores(id) ON DELETE CASCADE, -- NULL = todos do setor
  titulo VARCHAR(255) NOT NULL,
  mensagem TEXT NOT NULL,
  tipo VARCHAR(50) DEFAULT 'info', -- info, alerta, urgente
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create notificacoes_lidas table to track read status
CREATE TABLE IF NOT EXISTS notificacoes_lidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacao_id UUID NOT NULL REFERENCES notificacoes(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  lido_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(notificacao_id, colaborador_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notificacoes_setor ON notificacoes(setor_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_destinatario ON notificacoes(destinatario_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_criado_em ON notificacoes(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lidas_colaborador ON notificacoes_lidas(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lidas_notificacao ON notificacoes_lidas(notificacao_id);

-- Enable realtime for notificacoes
ALTER PUBLICATION supabase_realtime ADD TABLE notificacoes;
