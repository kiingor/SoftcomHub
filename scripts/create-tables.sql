-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABELA: setores (departments)
-- =============================================
CREATE TABLE IF NOT EXISTS setores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABELA: permissoes (permissions)
-- =============================================
CREATE TABLE IF NOT EXISTS permissoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  can_view_dashboard BOOLEAN DEFAULT FALSE,
  can_manage_users BOOLEAN DEFAULT FALSE,
  can_see_all_tickets BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABELA: clientes (customers)
-- =============================================
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  documento TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABELA: colaboradores (employees/agents)
-- =============================================
CREATE TABLE IF NOT EXISTS colaboradores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  setor_id UUID REFERENCES setores(id) ON DELETE SET NULL,
  permissao_id UUID REFERENCES permissoes(id) ON DELETE SET NULL,
  is_online BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABELA: tickets
-- =============================================
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  setor_id UUID NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_atendimento', 'encerrado')),
  prioridade TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('normal', 'urgente')),
  canal TEXT NOT NULL DEFAULT 'whatsapp',
  primeira_resposta_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  encerrado_em TIMESTAMPTZ
);

-- =============================================
-- TABELA: mensagens (messages)
-- =============================================
CREATE TABLE IF NOT EXISTS mensagens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  remetente TEXT NOT NULL CHECK (remetente IN ('cliente', 'colaborador')),
  conteudo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'imagem', 'audio', 'video', 'documento')),
  enviado_em TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABELA: disponibilidade_logs (availability logs)
-- =============================================
CREATE TABLE IF NOT EXISTS disponibilidade_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('online', 'offline')),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ÍNDICES para melhor performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_tickets_cliente_id ON tickets(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tickets_colaborador_id ON tickets(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_tickets_setor_id ON tickets(setor_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_mensagens_ticket_id ON mensagens(ticket_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_setor_id ON colaboradores(setor_id);
CREATE INDEX IF NOT EXISTS idx_disponibilidade_logs_colaborador_id ON disponibilidade_logs(colaborador_id);

-- =============================================
-- Dados iniciais de permissões
-- =============================================
INSERT INTO permissoes (nome, can_view_dashboard, can_manage_users, can_see_all_tickets)
VALUES 
  ('Admin', TRUE, TRUE, TRUE),
  ('Supervisor', TRUE, FALSE, TRUE),
  ('Atendente', FALSE, FALSE, FALSE)
ON CONFLICT DO NOTHING;
