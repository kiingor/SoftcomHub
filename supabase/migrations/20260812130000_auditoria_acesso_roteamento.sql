-- ════════════════════════════════════════════════════════════════════════
-- auditoria_acesso_roteamento — quem mudou o quê, e quando
-- ════════════════════════════════════════════════════════════════════════
--
-- Motivo: "alguém está tirando o subsetor do atendente". Sem registro não dá
-- para responder quem foi. `colaboradores_subsetores` é o que a distribuição
-- lê para rotear ticket (ticket-distribution, subsetor-routing,
-- subsetor-padrao-resolver, tickets/pull-next, tickets/transferir,
-- disparo-processor) — perder uma linha dessas é sumir da fila calado.
--
-- O mesmo vale um degrau acima: apagar um SETOR leva junto, por CASCADE, os
-- subsetores, os canais, os destinos de transferência e todos os vínculos.
-- Por isso a trilha cobre dois grupos de tabelas:
--
--   VÍNCULO        quem atende o quê  (colaboradores*, colaborador_setores)
--   CONFIGURAÇÃO   por onde o ticket entra e para onde ele vai
--                  (setores, subsetores, setor_canais, permissoes,
--                   setor_destinos_transferencia)
--
-- Daí o nome: acesso (quem pode) + roteamento (por onde). Ficam DE FORA, de
-- propósito, error_logs / notificacoes / push_subscriptions: alto volume e
-- baixo valor forense — afogariam a trilha.
--
-- POR QUE TRIGGER, E NÃO LOG NO CÓDIGO:
-- essas tabelas são escritas DIRETO DO NAVEGADOR via supabase-js, sem passar
-- por rota nenhuma (app/dashboard/colaboradores/page.tsx:633 e 649,
-- app/setor/[id]/page.tsx:1494 e 5402, e até hoje o próprio workdesk). Log
-- escrito pelo app só enxerga o caminho que o app conhece e é contornável
-- chamando o PostgREST direto. O trigger pega todos: UI, n8n, script avulso,
-- Studio.
--
-- Mesmo estilo de 20260525_add_setores_ativos_sessao.sql, que já instala
-- trigger em `colaboradores_setores`.
--
-- A AUDITORIA NUNCA DERRUBA A OPERAÇÃO: o corpo do trigger é envolvido por
-- EXCEPTION WHEN OTHERS. Falhar ao auditar não pode impedir a gravação —
-- auditoria é observação, não guarda.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────
-- TABELA
--
-- O registro se explica sozinho, sem consulta de apoio: QUEM (ator_*), O QUE
-- (dados_antes/dados_depois), EM QUE LINHA DE QUE TABELA (tabela, linha_id,
-- sujeito_*) e QUANDO (criado_em).
--
-- SEM FOREIGN KEY, de propósito, por dois motivos:
--
--   1. `colaboradores` já é alvo de várias FKs. Uma tabela com DUAS FKs para
--      ela (o sujeito e o ator) deixa todo embed não qualificado do PostgREST
--      ambíguo — erro 300, em produção, no instante da aplicação. Este projeto
--      já foi mordido por isso.
--   2. Registro de auditoria tem que sobreviver ao sumiço do sujeito. Com FK,
--      apagar o colaborador ou o setor ou cascatearia o histórico ou travaria
--      a exclusão. Os dois são piores do que um id órfão.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auditoria_acesso_roteamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tabela text NOT NULL,
  operacao text NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE')),
  linha_id uuid,

  -- ── SUJEITO: de quem, ou do quê, é a linha que mudou.
  --
  -- Numa tabela de vínculo o sujeito é a PESSOA; numa de configuração é o
  -- SETOR, o SUBSETOR, o CANAL, a PERMISSÃO. Uma coluna `colaborador_id` só
  -- serviria ao primeiro grupo — e no segundo guardaria o id do setor num
  -- campo que diz "colaborador", mentindo sobre o que descreve. Por isso o
  -- sujeito é genérico e o colaborador é um caso particular dele.
  --
  -- `sujeito_rotulo` e `sujeito_email` são resolvidos NO INSTANTE da escrita,
  -- e é isso que faz a trilha continuar legível depois que a conta ou o setor
  -- forem apagados.
  sujeito_tipo text NOT NULL DEFAULT 'desconhecido'
    CHECK (sujeito_tipo IN (
      'colaborador', 'setor', 'subsetor', 'canal', 'permissao',
      'transferencia', 'desconhecido'
    )),
  sujeito_id uuid,
  sujeito_rotulo text,
  sujeito_email text,

  -- ── CONTEXTO: o setor a que a linha pertence, quando existe um.
  -- Responde "onde isso aconteceu" sem join, e sobrevive ao setor sumir.
  contexto_setor_id uuid,
  contexto_setor_nome text,

  dados_antes jsonb,
  dados_depois jsonb,

  -- ── ATOR: quem fez. Ver a seção de resolução do ator, na função.
  ator_origem text NOT NULL DEFAULT 'desconhecido',
  ator_email text,
  ator_uid uuid,
  ator_colaborador_id uuid,
  ator_nome text,
  ator_role text,

  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.auditoria_acesso_roteamento IS
  'Trilha de auditoria de acesso (quem atende o quê) e roteamento (por onde o ticket entra e vai). Escrita só por trigger; sem FK de propósito.';
COMMENT ON COLUMN public.auditoria_acesso_roteamento.sujeito_tipo IS
  'Que espécie de coisa a linha descreve. Decidido pela TABELA, não adivinhado pelas colunas.';
COMMENT ON COLUMN public.auditoria_acesso_roteamento.sujeito_rotulo IS
  'Nome legível do sujeito, resolvido no instante da escrita para sobreviver ao DELETE.';
COMMENT ON COLUMN public.auditoria_acesso_roteamento.sujeito_email IS
  'Só colaborador tem. NULL nas tabelas de configuração.';
COMMENT ON COLUMN public.auditoria_acesso_roteamento.contexto_setor_nome IS
  'Nome do setor no instante da escrita. Fica NULL nas linhas que caem por CASCADE do DELETE do próprio setor — nessas, o nome está na linha de tabela=setores do mesmo instante.';
COMMENT ON COLUMN public.auditoria_acesso_roteamento.ator_uid IS
  'auth.uid() cru, guardado só como evidência. NÃO é chave de colaboradores — ver ator_colaborador_id.';
COMMENT ON COLUMN public.auditoria_acesso_roteamento.ator_colaborador_id IS
  'Colaborador resolvido POR E-MAIL do JWT, do mesmo jeito que useColaborador e requireAdmin resolvem.';

-- Tabela nova e vazia: índice comum basta, não há o que travar.
CREATE INDEX IF NOT EXISTS idx_auditoria_acesso_criado_em
  ON public.auditoria_acesso_roteamento (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_acesso_sujeito
  ON public.auditoria_acesso_roteamento (sujeito_tipo, sujeito_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_acesso_contexto_setor
  ON public.auditoria_acesso_roteamento (contexto_setor_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_acesso_tabela
  ON public.auditoria_acesso_roteamento (tabela, operacao, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_acesso_ator_email
  ON public.auditoria_acesso_roteamento (ator_email, criado_em DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- ACESSO
--
-- A trilha não é exposta ao navegador. RLS ligada sem nenhuma policy fecha
-- para anon e authenticated; service_role e o dono da tabela continuam
-- passando — é o que o trigger (SECURITY DEFINER) usa para gravar.
--
-- Não deixamos policy de escrita para ninguém: quem grava é o trigger, e log
-- de auditoria editável pela própria aplicação não vale como prova.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.auditoria_acesso_roteamento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.auditoria_acesso_roteamento FROM anon, authenticated;
GRANT SELECT ON public.auditoria_acesso_roteamento TO service_role;

COMMIT;
