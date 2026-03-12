-- Permite que um colaborador pertença a múltiplos subsetores dentro de um setor

-- 1. Criar nova tabela N:N
CREATE TABLE IF NOT EXISTS colaboradores_subsetores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  setor_id UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  subsetor_id UUID NOT NULL REFERENCES subsetores(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(colaborador_id, setor_id, subsetor_id)
);

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_colab_subsetores_colaborador ON colaboradores_subsetores(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_colab_subsetores_setor ON colaboradores_subsetores(setor_id);
CREATE INDEX IF NOT EXISTS idx_colab_subsetores_subsetor ON colaboradores_subsetores(subsetor_id);

-- 3. Migrar dados existentes de colaboradores_setores.subsetor_id
INSERT INTO colaboradores_subsetores (colaborador_id, setor_id, subsetor_id)
SELECT colaborador_id, setor_id, subsetor_id
FROM colaboradores_setores
WHERE subsetor_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. RLS - mesma política de acesso
ALTER TABLE colaboradores_subsetores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso autenticado a colaboradores_subsetores"
  ON colaboradores_subsetores
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
