-- =====================================================================
-- SOFTCOMHUB — MIGRAÇÃO COMPLETA DO BANCO DE DADOS (Supabase)
-- Gerado em: 2026-03-27
-- Versão: 1.0
--
-- Este script cria TODAS as tabelas, índices, constraints, RLS policies,
-- dados iniciais e configurações de Realtime do zero.
-- Executar no SQL Editor do Supabase na ordem apresentada.
-- =====================================================================


-- =============================================================
-- 0. EXTENSÕES
-- =============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================
-- 1. TABELAS PRINCIPAIS (sem dependências externas)
-- =============================================================

-- ----- TAGS (agrupamento de setores) -----
CREATE TABLE tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  cor         TEXT NOT NULL DEFAULT '#6B7280',
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- ----- PERMISSÕES -----
CREATE TABLE permissoes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome                TEXT NOT NULL,
  can_view_dashboard  BOOLEAN DEFAULT FALSE,
  can_manage_users    BOOLEAN DEFAULT FALSE,
  can_see_all_tickets BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ----- SETORES -----
CREATE TABLE setores (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome                  TEXT NOT NULL,
  descricao             TEXT,
  canal                 TEXT DEFAULT 'whatsapp',
  cor                   TEXT DEFAULT '#3B82F6',
  icon_url              TEXT,
  tag_id                UUID REFERENCES tags(id) ON DELETE SET NULL,
  -- Receptor / Transmissor
  is_receptor           BOOLEAN DEFAULT FALSE,
  transmissao_ativa     BOOLEAN DEFAULT FALSE,
  setor_receptor_id     UUID REFERENCES setores(id) ON DELETE SET NULL,
  -- WhatsApp Cloud API (legado — campos no setor)
  template_id           TEXT,
  template_language     TEXT DEFAULT 'pt_BR',
  phone_number_id       TEXT,
  whatsapp_token        TEXT,
  -- Evolution API (legado)
  evolution_base_url    TEXT,
  evolution_api_key     TEXT,
  -- Discord (legado)
  discord_bot_token     TEXT,
  discord_channel_id    TEXT,
  discord_guild_id      TEXT,
  -- Webhook
  webhook_url           TEXT,
  webhook_eventos       TEXT[] DEFAULT '{}',
  -- Configurações
  mensagem_finalizacao  TEXT,
  max_disparos_dia      INTEGER DEFAULT 50,
  tempo_espera_minutos  INTEGER DEFAULT 0,
  -- Timestamps
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ----- CLIENTES -----
CREATE TABLE clientes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        TEXT,
  telefone    TEXT,
  email       TEXT,
  documento   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----- COLABORADORES -----
CREATE TABLE colaboradores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  setor_id        UUID REFERENCES setores(id) ON DELETE SET NULL,
  permissao_id    UUID REFERENCES permissoes(id) ON DELETE SET NULL,
  is_online       BOOLEAN DEFAULT FALSE,
  is_master       BOOLEAN DEFAULT FALSE,
  ativo           BOOLEAN DEFAULT TRUE,
  last_heartbeat  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
  -- pausa_atual_id adicionado após criar pausas_colaboradores
);

-- ----- SUBSETORES -----
CREATE TABLE subsetores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id    UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  descricao   TEXT,
  ativo       BOOLEAN DEFAULT TRUE,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================
-- 2. TABELAS DE TICKETS E MENSAGENS
-- =============================================================

-- ----- TICKETS -----
CREATE TABLE tickets (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero                SERIAL,
  cliente_id            UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  colaborador_id        UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  setor_id              UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  subsetor_id           UUID REFERENCES subsetores(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'aberto'
                          CHECK (status IN ('aberto', 'em_atendimento', 'encerrado')),
  prioridade            TEXT NOT NULL DEFAULT 'normal'
                          CHECK (prioridade IN ('normal', 'urgente')),
  canal                 TEXT NOT NULL DEFAULT 'whatsapp',
  primeira_resposta_em  TIMESTAMPTZ,
  criado_em             TIMESTAMPTZ DEFAULT NOW(),
  encerrado_em          TIMESTAMPTZ,
  -- Disparo (envio ativo de templates)
  disparo_em            TIMESTAMPTZ,
  is_disparo            BOOLEAN DEFAULT FALSE,
  -- Distribuição automática
  assignment_lock_until TIMESTAMPTZ,
  assignment_attempts   INTEGER DEFAULT 0,
  -- Discord
  user_name_discord     TEXT
);

-- ----- MENSAGENS -----
CREATE TABLE mensagens (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id             UUID REFERENCES tickets(id) ON DELETE CASCADE,  -- nullable (bot conversations)
  cliente_id            UUID REFERENCES clientes(id) ON DELETE SET NULL,
  remetente             TEXT NOT NULL
                          CHECK (remetente IN ('cliente', 'colaborador', 'bot', 'sistema')),
  conteudo              TEXT NOT NULL,
  tipo                  TEXT NOT NULL DEFAULT 'texto'
                          CHECK (tipo IN ('texto', 'imagem', 'audio', 'video', 'documento')),
  canal                 TEXT DEFAULT 'whatsapp',
  is_bot                BOOLEAN DEFAULT FALSE,
  -- WhatsApp
  phone_number_id       TEXT,
  whatsapp_message_id   TEXT,
  instancia             TEXT,
  -- Mídia
  url_imagem            TEXT,
  media_type            TEXT,
  -- Timestamp
  enviado_em            TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================
-- 3. TABELAS DE CANAIS E CONFIGURAÇÃO
-- =============================================================

-- ----- SETOR_CANAIS (canais de atendimento por setor) -----
CREATE TABLE setor_canais (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id            UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  nome                TEXT,
  tipo                TEXT,  -- 'whatsapp', 'evolution_api', 'discord', 'webhook'
  ativo               BOOLEAN DEFAULT TRUE,
  instancia           TEXT,
  -- WhatsApp Cloud API
  phone_number_id     TEXT,
  whatsapp_token      TEXT,
  template_id         TEXT,
  template_language   TEXT DEFAULT 'pt_BR',
  -- Evolution API
  evolution_base_url  TEXT,
  evolution_api_key   TEXT,
  -- Discord
  discord_bot_token   TEXT,
  discord_guild_id    TEXT,
  -- Config
  max_disparos_dia    INTEGER DEFAULT 0,
  criado_em           TIMESTAMPTZ DEFAULT NOW()
);

-- ----- SETOR_TIPOS_ATENDIMENTO (roteamento por tipo) -----
CREATE TABLE setor_tipos_atendimento (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id          UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL
                      CHECK (tipo IN ('suporte', 'ouvidoria', 'financeiro', 'implantacao', 'comercial')),
  setor_destino_id  UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  criado_em         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(setor_id, tipo)
);

-- ----- CANAL_TIPOS_ATENDIMENTO (roteamento por canal) -----
CREATE TABLE canal_tipos_atendimento (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id    UUID NOT NULL REFERENCES setor_canais(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL
                CHECK (tipo IN ('suporte', 'ouvidoria', 'financeiro', 'implantacao', 'comercial')),
  setor_id    UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(canal_id, tipo)
);

-- ----- SETOR_DESTINOS_TRANSFERENCIA -----
CREATE TABLE setor_destinos_transferencia (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_origem_id   UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  setor_destino_id  UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  criado_em         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(setor_origem_id, setor_destino_id)
);

-- ----- HORARIOS_ATENDIMENTO -----
CREATE TABLE horarios_atendimento (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id    UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  dia_semana  INTEGER NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
  ativo       BOOLEAN DEFAULT FALSE,
  hora_inicio TIME,
  hora_fim    TIME,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(setor_id, dia_semana)
);

-- ----- TEMPLATES_MENSAGEM -----
CREATE TABLE templates_mensagem (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id    UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  atalho      TEXT NOT NULL,
  titulo      TEXT NOT NULL,
  mensagem    TEXT NOT NULL,
  ativo       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(setor_id, atalho)
);

-- ----- TICKET_DISTRIBUTION_CONFIG -----
CREATE TABLE ticket_distribution_config (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id                UUID UNIQUE REFERENCES setores(id) ON DELETE CASCADE,
  check_interval_seconds  INTEGER DEFAULT 30,
  max_tickets_per_agent   INTEGER DEFAULT 10,
  queue_timeout_minutes   INTEGER DEFAULT 60,
  auto_assign_enabled     BOOLEAN DEFAULT TRUE,
  priority_by_wait_time   BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================
-- 4. TABELAS DE RELACIONAMENTO (JUNCTION / N:N)
-- =============================================================

-- ----- COLABORADORES_SETORES (N:N — atendimento) -----
CREATE TABLE colaboradores_setores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  setor_id        UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(colaborador_id, setor_id)
);

-- ----- COLABORADOR_SETORES (N:N — permissão de acesso / dashboard) -----
CREATE TABLE colaborador_setores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  setor_id        UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(colaborador_id, setor_id)
);

-- ----- COLABORADORES_SUBSETORES (N:N) -----
CREATE TABLE colaboradores_subsetores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  setor_id        UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  subsetor_id     UUID NOT NULL REFERENCES subsetores(id) ON DELETE CASCADE,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(colaborador_id, setor_id, subsetor_id)
);


-- =============================================================
-- 5. TABELAS DE PAUSAS
-- =============================================================

-- ----- PAUSAS (tipos de pausa por setor) -----
CREATE TABLE pausas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id              UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  nome                  VARCHAR(100) NOT NULL,
  descricao             TEXT,
  tempo_maximo_minutos  INTEGER,
  ativo                 BOOLEAN DEFAULT TRUE,
  criado_em             TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ DEFAULT NOW()
);

-- ----- PAUSAS_COLABORADORES (registros de pausa) -----
CREATE TABLE pausas_colaboradores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  pausa_id        UUID NOT NULL REFERENCES pausas(id) ON DELETE CASCADE,
  setor_id        UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  inicio          TIMESTAMPTZ DEFAULT NOW(),
  fim             TIMESTAMPTZ,
  duracao_minutos INTEGER,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar FK de pausa_atual no colaborador (dependência circular)
ALTER TABLE colaboradores
  ADD COLUMN pausa_atual_id UUID REFERENCES pausas_colaboradores(id) ON DELETE SET NULL;


-- =============================================================
-- 6. TABELAS DE LOGS E AUDITORIA
-- =============================================================

-- ----- DISPONIBILIDADE_LOGS -----
CREATE TABLE disponibilidade_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  colaborador_id  UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('online', 'offline')),
  timestamp       TIMESTAMPTZ DEFAULT NOW()
);

-- ----- TICKET_LOGS -----
CREATE TABLE ticket_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL
                CHECK (tipo IN ('status', 'observacao', 'transferencia', 'manual', 'criacao', 'transferencia_automatica')),
  descricao   TEXT NOT NULL,
  autor_id    UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- ----- TICKET_ASSIGNMENT_LOGS -----
CREATE TABLE ticket_assignment_logs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id               UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  colaborador_id          UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  setor_id                UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  action                  TEXT NOT NULL
                            CHECK (action IN ('auto_assigned', 'manual_assigned', 'transferred', 'unassigned', 'queue_timeout')),
  previous_colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  queue_wait_time_seconds INTEGER,
  assignment_reason       TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  created_by              UUID REFERENCES colaboradores(id) ON DELETE SET NULL
);

-- ----- DISPARO_LOGS -----
CREATE TABLE disparo_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id          UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  ticket_id         UUID REFERENCES tickets(id) ON DELETE SET NULL,
  colaborador_id    UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  colaborador_nome  TEXT NOT NULL,
  cliente_nome      TEXT,
  cliente_telefone  TEXT,
  cliente_cnpj      TEXT,
  template_name     TEXT,
  status            TEXT DEFAULT 'enviado',
  criado_em         TIMESTAMPTZ DEFAULT NOW()
);

-- ----- ERROR_LOGS -----
CREATE TABLE error_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tela          TEXT NOT NULL,
  rota          TEXT NOT NULL,
  log           TEXT NOT NULL,
  componente    TEXT,
  usuario_id    UUID,
  usuario_nome  TEXT,
  navegador     TEXT,
  metadata      JSONB DEFAULT '{}',
  resolvido     BOOLEAN DEFAULT FALSE,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================
-- 7. TABELAS DE NOTIFICAÇÕES
-- =============================================================

-- ----- NOTIFICACOES -----
CREATE TABLE notificacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id        UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  remetente_id    UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  destinatario_id UUID REFERENCES colaboradores(id) ON DELETE CASCADE,  -- NULL = todos do setor
  titulo          VARCHAR(255) NOT NULL,
  mensagem        TEXT NOT NULL,
  tipo            VARCHAR(50) DEFAULT 'info',  -- 'info', 'alerta', 'urgente'
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- ----- NOTIFICACOES_LIDAS -----
CREATE TABLE notificacoes_lidas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacao_id  UUID NOT NULL REFERENCES notificacoes(id) ON DELETE CASCADE,
  colaborador_id  UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  lido_em         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(notificacao_id, colaborador_id)
);


-- =============================================================
-- 8. ÍNDICES
-- =============================================================

-- Setores
CREATE INDEX idx_setores_tag_id ON setores(tag_id);

-- Colaboradores
CREATE INDEX idx_colaboradores_setor_id ON colaboradores(setor_id);
CREATE INDEX idx_colaboradores_last_heartbeat ON colaboradores(last_heartbeat);
CREATE INDEX idx_colaboradores_is_online ON colaboradores(is_online);

-- Tickets
CREATE INDEX idx_tickets_cliente_id ON tickets(cliente_id);
CREATE INDEX idx_tickets_colaborador_id ON tickets(colaborador_id);
CREATE INDEX idx_tickets_setor_id ON tickets(setor_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_numero ON tickets(numero);

-- Mensagens
CREATE INDEX idx_mensagens_ticket_id ON mensagens(ticket_id);
CREATE INDEX idx_mensagens_cliente_id ON mensagens(cliente_id);
CREATE INDEX idx_mensagens_whatsapp_message_id ON mensagens(whatsapp_message_id);

-- Disponibilidade
CREATE INDEX idx_disponibilidade_logs_colaborador_id ON disponibilidade_logs(colaborador_id);

-- Pausas
CREATE INDEX idx_pausas_setor ON pausas(setor_id);
CREATE INDEX idx_pausas_colaboradores_colaborador ON pausas_colaboradores(colaborador_id);
CREATE INDEX idx_pausas_colaboradores_pausa ON pausas_colaboradores(pausa_id);
CREATE INDEX idx_pausas_colaboradores_inicio ON pausas_colaboradores(inicio);
CREATE INDEX idx_pausas_colaboradores_ativo ON pausas_colaboradores(fim) WHERE fim IS NULL;

-- Ticket Logs
CREATE INDEX idx_ticket_logs_ticket_id ON ticket_logs(ticket_id);
CREATE INDEX idx_ticket_logs_criado_em ON ticket_logs(criado_em DESC);

-- Ticket Assignment Logs
CREATE INDEX idx_ticket_assignment_logs_ticket_id ON ticket_assignment_logs(ticket_id);
CREATE INDEX idx_ticket_assignment_logs_colaborador_id ON ticket_assignment_logs(colaborador_id);
CREATE INDEX idx_ticket_assignment_logs_created_at ON ticket_assignment_logs(created_at DESC);
CREATE INDEX idx_ticket_assignment_logs_action ON ticket_assignment_logs(action);

-- Disparo Logs
CREATE INDEX idx_disparo_logs_setor_criado ON disparo_logs(setor_id, criado_em);

-- Error Logs
CREATE INDEX idx_error_logs_criado_em ON error_logs(criado_em DESC);
CREATE INDEX idx_error_logs_resolvido ON error_logs(resolvido);
CREATE INDEX idx_error_logs_tela ON error_logs(tela);

-- Notificações
CREATE INDEX idx_notificacoes_setor ON notificacoes(setor_id);
CREATE INDEX idx_notificacoes_destinatario ON notificacoes(destinatario_id);
CREATE INDEX idx_notificacoes_criado_em ON notificacoes(criado_em DESC);
CREATE INDEX idx_notificacoes_lidas_colaborador ON notificacoes_lidas(colaborador_id);
CREATE INDEX idx_notificacoes_lidas_notificacao ON notificacoes_lidas(notificacao_id);

-- Templates
CREATE INDEX idx_templates_setor ON templates_mensagem(setor_id);
CREATE INDEX idx_templates_atalho ON templates_mensagem(atalho);

-- Horários
CREATE INDEX idx_horarios_setor ON horarios_atendimento(setor_id);

-- Transferências
CREATE INDEX idx_sdt_origem ON setor_destinos_transferencia(setor_origem_id);
CREATE INDEX idx_sdt_destino ON setor_destinos_transferencia(setor_destino_id);

-- Canal Tipos Atendimento
CREATE INDEX idx_canal_tipos_atendimento_canal_id ON canal_tipos_atendimento(canal_id);

-- Junction: Colaboradores ↔ Setores
CREATE INDEX idx_colaboradores_setores_colaborador ON colaboradores_setores(colaborador_id);
CREATE INDEX idx_colaboradores_setores_setor ON colaboradores_setores(setor_id);
CREATE INDEX idx_colaborador_setores_colaborador ON colaborador_setores(colaborador_id);
CREATE INDEX idx_colaborador_setores_setor ON colaborador_setores(setor_id);

-- Junction: Colaboradores ↔ Subsetores
CREATE INDEX idx_colab_subsetores_colaborador ON colaboradores_subsetores(colaborador_id);
CREATE INDEX idx_colab_subsetores_setor ON colaboradores_subsetores(setor_id);
CREATE INDEX idx_colab_subsetores_subsetor ON colaboradores_subsetores(subsetor_id);


-- =============================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- =============================================================

-- Pausas
ALTER TABLE pausas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pausas são visíveis para todos" ON pausas
  FOR SELECT USING (true);
CREATE POLICY "Pausas podem ser gerenciadas" ON pausas
  FOR ALL USING (true);

-- Pausas Colaboradores
ALTER TABLE pausas_colaboradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pausas colaboradores são visíveis para todos" ON pausas_colaboradores
  FOR SELECT USING (true);
CREATE POLICY "Pausas colaboradores podem ser gerenciadas" ON pausas_colaboradores
  FOR ALL USING (true);

-- Tags
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados podem ler tags" ON tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem gerenciar tags" ON tags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Colaboradores Setores
ALTER TABLE colaboradores_setores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read colaboradores_setores" ON colaboradores_setores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert colaboradores_setores" ON colaboradores_setores
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated delete colaboradores_setores" ON colaboradores_setores
  FOR DELETE TO authenticated USING (true);

-- Colaboradores Subsetores
ALTER TABLE colaboradores_subsetores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso autenticado a colaboradores_subsetores" ON colaboradores_subsetores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Ticket Assignment Logs
ALTER TABLE ticket_assignment_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read assignment logs" ON ticket_assignment_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can insert assignment logs" ON ticket_assignment_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Ticket Distribution Config
ALTER TABLE ticket_distribution_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read distribution config" ON ticket_distribution_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage distribution config" ON ticket_distribution_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Setor Destinos Transferência
ALTER TABLE setor_destinos_transferencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados podem ler destinos de transferencia" ON setor_destinos_transferencia
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem gerenciar destinos de transferencia" ON setor_destinos_transferencia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Canal Tipos Atendimento
ALTER TABLE canal_tipos_atendimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to canal_tipos_atendimento" ON canal_tipos_atendimento
  FOR ALL USING (true);


-- =============================================================
-- 10. REALTIME (Publicação para Supabase Realtime)
-- =============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE notificacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE templates_mensagem;


-- =============================================================
-- 11. DADOS INICIAIS (SEEDS)
-- =============================================================

-- Permissões padrão
INSERT INTO permissoes (nome, can_view_dashboard, can_manage_users, can_see_all_tickets)
VALUES
  ('Admin', TRUE, TRUE, TRUE),
  ('Supervisor', TRUE, FALSE, TRUE),
  ('Atendente', FALSE, FALSE, FALSE)
ON CONFLICT DO NOTHING;
