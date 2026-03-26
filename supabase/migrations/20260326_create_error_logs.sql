-- Tabela de logs de erros da plataforma
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tela TEXT NOT NULL,
  rota TEXT NOT NULL,
  log TEXT NOT NULL,
  componente TEXT,
  usuario_id UUID,
  usuario_nome TEXT,
  navegador TEXT,
  metadata JSONB DEFAULT '{}',
  resolvido BOOLEAN DEFAULT FALSE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_criado_em ON error_logs(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolvido ON error_logs(resolvido);
CREATE INDEX IF NOT EXISTS idx_error_logs_tela ON error_logs(tela);
