-- =============================================
-- FASE 1 — Tampar acesso anônimo via anon key (resposta ao security advisor)
-- =============================================
-- Hoje 17 tabelas em public estão expostas em PostgREST sem RLS — qualquer
-- pessoa com a anon key (que está no bundle do client) pode ler/gravar tudo.
--
-- Esta migration:
--   1. Habilita RLS em 16 tabelas (a 17ª, mensagens, é tratada à parte por
--      já ter policies legadas).
--   2. Cria uma policy permissiva "fase1_authenticated_all" em cada uma:
--      FOR ALL TO authenticated USING (true) WITH CHECK (true).
--   3. Converte 4 views SECURITY DEFINER para SECURITY INVOKER.
--
-- O que muda no comportamento:
--   - Anônimo (sem JWT): BLOQUEADO em todas estas tabelas via REST. ✅
--   - Authenticated (atendente logado, admin): liberado como antes.
--   - service role (usado pelas API routes do app): bypassa RLS sempre.
--
-- O que NÃO muda:
--   - Webhook do WhatsApp, distribuição, transferência, criação de ticket,
--     realtime de mensagens — todos usam service role ou auth válido.
--
-- Idempotente: roda quantas vezes quiser sem efeito colateral.
-- Rollback: ver bloco comentado no final do arquivo.
-- =============================================

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'clientes',
    'avaliacoes',
    'error_logs',
    'disparo_logs',
    'disponibilidade_logs',
    'colaboradores',
    'colaborador_setores',
    'mensagens',
    'horarios_atendimento',
    'permissoes',
    'notificacoes',
    'notificacoes_lidas',
    'ticket_logs',
    'templates_mensagem',
    'tickets',
    'setores'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Pula se a tabela não existe (defensivo)
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl
    ) THEN
      RAISE NOTICE 'Tabela public.% nao existe — pulando', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "fase1_authenticated_all" ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY "fase1_authenticated_all" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl
    );
    RAISE NOTICE 'RLS + policy permissiva ON em public.%', tbl;
  END LOOP;
END $$;

-- -----------------------------------------------------------------
-- Views SECURITY DEFINER → SECURITY INVOKER
-- (View vai rodar com as permissões do user que consulta, respeitando RLS)
-- -----------------------------------------------------------------
DO $$
DECLARE
  v text;
  views text[] := ARRAY[
    'vw_cliente_ticket_aberto',
    'vw_clientes_sem_software',
    'view_agent_dashboard',
    'v_setores_disponibilidade'
  ];
BEGIN
  FOREACH v IN ARRAY views LOOP
    IF EXISTS (
      SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = v
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
      RAISE NOTICE 'View public.% agora roda como SECURITY INVOKER', v;
    ELSE
      RAISE NOTICE 'View public.% nao existe — pulando', v;
    END IF;
  END LOOP;
END $$;

-- =============================================
-- ROLLBACK — copiar e colar no SQL Editor se precisar reverter
-- =============================================
-- DO $$
-- DECLARE
--   tbl text;
--   tables text[] := ARRAY[
--     'clientes','avaliacoes','error_logs','disparo_logs','disponibilidade_logs',
--     'colaboradores','colaborador_setores','mensagens','horarios_atendimento',
--     'permissoes','notificacoes','notificacoes_lidas','ticket_logs',
--     'templates_mensagem','tickets','setores'
--   ];
-- BEGIN
--   FOREACH tbl IN ARRAY tables LOOP
--     EXECUTE format('DROP POLICY IF EXISTS "fase1_authenticated_all" ON public.%I', tbl);
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
--   END LOOP;
-- END $$;
--
-- ALTER VIEW public.vw_cliente_ticket_aberto SET (security_invoker = false);
-- ALTER VIEW public.vw_clientes_sem_software SET (security_invoker = false);
-- ALTER VIEW public.view_agent_dashboard SET (security_invoker = false);
-- ALTER VIEW public.v_setores_disponibilidade SET (security_invoker = false);
