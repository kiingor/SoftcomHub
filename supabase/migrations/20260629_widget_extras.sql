-- Extras do chat widget — consolida ajustes aplicados durante o desenvolvimento
-- (banco compartilhado prod/dev: rodar no Supabase Studio).

-- 1) Permitir remetente 'cliente-widget' nas mensagens do widget
ALTER TABLE mensagens DROP CONSTRAINT IF EXISTS mensagens_remetente_check;
ALTER TABLE mensagens ADD CONSTRAINT mensagens_remetente_check CHECK (
  remetente = ANY (
    ARRAY[
      'cliente'::text,
      'colaborador'::text,
      'bot'::text,
      'sistema'::text,
      'supervisor'::text,
      'cliente-nexus'::text,
      'bot-nexus'::text,
      'cliente-widget'::text
    ]
  )
);

-- 2) Identificador de canal por widget (vira o "canal" do ticket nos relatórios)
ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS canal text;

-- 3) Índices p/ identificação do cliente (telefone principal, CNPJ alternativo)
CREATE INDEX IF NOT EXISTS idx_clientes_telefone
  ON clientes (telefone) WHERE telefone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj
  ON clientes ("CNPJ") WHERE "CNPJ" IS NOT NULL;
