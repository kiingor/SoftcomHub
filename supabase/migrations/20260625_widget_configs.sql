-- Tabela: widget_configs
-- Armazena configuração de cada instância de widget (identificado por API key)

CREATE TABLE widget_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidade do widget
  api_key text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,

  -- Segurança
  allowed_domains text[] DEFAULT '{}',

  -- Fila
  max_queue_size int,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX idx_widget_configs_api_key ON widget_configs(api_key)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_widget_configs_deleted ON widget_configs(deleted_at);

-- Tabela: widget_sector_mapping
-- Mapeia quais setores cada widget mostra e qual é o transbordo

CREATE TABLE widget_sector_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id uuid NOT NULL REFERENCES widget_configs(id) ON DELETE CASCADE,
  setor_id uuid NOT NULL REFERENCES setores(id) ON DELETE CASCADE,

  -- Ordem de exibição no dropdown
  display_order int DEFAULT 999,

  -- Setor para onde transborda se todos ocupados
  setor_transbordo_id uuid REFERENCES setores(id) ON DELETE SET NULL,

  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_widget_sector_mapping_unique
  ON widget_sector_mapping(widget_id, setor_id);
CREATE INDEX idx_widget_sector_mapping_setor
  ON widget_sector_mapping(setor_id);


-- RLS para widget_configs (apenas admin vê)
ALTER TABLE widget_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "widget_configs_admin_only"
  ON widget_configs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM colaboradores
      WHERE id = auth.uid() AND is_admin = true
    )
  );
