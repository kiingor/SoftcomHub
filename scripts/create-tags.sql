-- Tabela de Tags para agrupar setores
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#6B7280',
  criado_em timestamptz DEFAULT now()
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ler tags"
  ON tags FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados podem gerenciar tags"
  ON tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Coluna tag_id na tabela setores
ALTER TABLE setores ADD COLUMN IF NOT EXISTS tag_id uuid REFERENCES tags(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_setores_tag_id ON setores (tag_id);
