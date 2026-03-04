-- Tabela de tipos de pausas (configuração por setor)
CREATE TABLE IF NOT EXISTS pausas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setor_id UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  tempo_maximo_minutos INTEGER, -- tempo máximo permitido para a pausa (opcional)
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de registro de pausas dos colaboradores
CREATE TABLE IF NOT EXISTS pausas_colaboradores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  pausa_id UUID NOT NULL REFERENCES pausas(id) ON DELETE CASCADE,
  setor_id UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  inicio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  fim TIMESTAMP WITH TIME ZONE,
  duracao_minutos INTEGER, -- calculado quando finaliza
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pausas_setor ON pausas(setor_id);
CREATE INDEX IF NOT EXISTS idx_pausas_colaboradores_colaborador ON pausas_colaboradores(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_pausas_colaboradores_pausa ON pausas_colaboradores(pausa_id);
CREATE INDEX IF NOT EXISTS idx_pausas_colaboradores_inicio ON pausas_colaboradores(inicio);
CREATE INDEX IF NOT EXISTS idx_pausas_colaboradores_ativo ON pausas_colaboradores(fim) WHERE fim IS NULL;

-- Adicionar coluna de pausa atual no colaborador
ALTER TABLE colaboradores 
ADD COLUMN IF NOT EXISTS pausa_atual_id UUID REFERENCES pausas_colaboradores(id) ON DELETE SET NULL;

-- RLS Policies
ALTER TABLE pausas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pausas_colaboradores ENABLE ROW LEVEL SECURITY;

-- Políticas para pausas
DROP POLICY IF EXISTS "Pausas são visíveis para todos" ON pausas;
CREATE POLICY "Pausas são visíveis para todos" ON pausas
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Pausas podem ser gerenciadas" ON pausas;
CREATE POLICY "Pausas podem ser gerenciadas" ON pausas
  FOR ALL USING (true);

-- Políticas para pausas_colaboradores
DROP POLICY IF EXISTS "Pausas colaboradores são visíveis para todos" ON pausas_colaboradores;
CREATE POLICY "Pausas colaboradores são visíveis para todos" ON pausas_colaboradores
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Pausas colaboradores podem ser gerenciadas" ON pausas_colaboradores;
CREATE POLICY "Pausas colaboradores podem ser gerenciadas" ON pausas_colaboradores
  FOR ALL USING (true);
