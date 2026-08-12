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

-- ─────────────────────────────────────────────────────────────────────────
-- Cast de uuid que não explode. Um id fora do formato não pode derrubar o
-- registro inteiro — vira NULL e o resto do log continua de pé.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auditoria_uuid(valor text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN valor::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- REDAÇÃO DE SEGREDO
--
-- `setores` e `setor_canais` guardam credencial em coluna comum:
-- whatsapp_token, evolution_api_key, discord_bot_token e webhook_url (o do
-- Discord já vem com o token embutido na própria URL). Copiar a linha inteira
-- para a auditoria criaria uma SEGUNDA cópia de cada credencial — e, no
-- DELETE, uma cópia que sobrevive à original para sempre.
--
-- Guardamos uma impressão digital em vez do valor. Não dá para ler o segredo,
-- mas antes e depois continuam DIFERENTES quando ele muda: trocar uma chave
-- em silêncio continua aparecendo na trilha, que é o ponto.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auditoria_redigir(dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_chave text;
BEGIN
  IF dados IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_chave IN ARRAY ARRAY[
    'whatsapp_token', 'evolution_api_key', 'discord_bot_token', 'webhook_url'
  ] LOOP
    -- jsonb_exists() e não o operador `?`: esta migration é colada à mão no
    -- SQL Editor, e cliente que trata `?` como placeholder de parâmetro
    -- estraga o arquivo inteiro.
    IF jsonb_exists(dados, v_chave) AND jsonb_typeof(dados -> v_chave) = 'string' THEN
      dados := jsonb_set(
        dados,
        ARRAY[v_chave],
        to_jsonb('[redigido:' || left(md5(dados ->> v_chave), 8) || ']')
      );
    END IF;
  END LOOP;

  RETURN dados;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- TRIGGER GENÉRICO
--
-- Lê a linha inteira como jsonb, então serve para qualquer tabela sem
-- conhecer as colunas de cada uma.
--
-- RESOLUÇÃO DO SUJEITO — decidida pela TABELA, nunca adivinhada:
--
--   Adivinhar por coluna (`COALESCE(colaborador_id, id)`) acerta nas tabelas
--   de vínculo e erra feio nas de configuração: em `setores`, `id` é o id do
--   SETOR, e ele acabaria numa coluna de colaborador que nenhum
--   `JOIN colaboradores` resolveria. Ficaria um registro mentindo sobre o que
--   descreve. Por isso o mapa abaixo é explícito, tabela por tabela, e o
--   colaborador é um caso particular do sujeito — não o formato dele.
--
--   O rótulo vem da PRÓPRIA LINHA (`v_linha ->> 'nome'`) sempre que a tabela
--   carrega o nome, porque no DELETE a linha já saiu da tabela e um SELECT
--   não acharia mais nada.
--
-- RESOLUÇÃO DO ATOR — a outra parte delicada:
--
--   • `colaboradores.id` NÃO é garantidamente o `auth.uid()`. Os dois
--     caminhos de criação divergem: dashboard/colaboradores grava
--     `id: authData.user.id`, enquanto setor/[id] insere sem `id` e deixa o
--     DEFAULT gerar outro uuid. Por isso o app inteiro resolve o colaborador
--     POR E-MAIL (lib/hooks/use-data.ts useColaborador,
--     lib/auth/require-admin.ts). Aqui é igual: o e-mail do JWT é a chave, e
--     `auth.uid()` fica gravado ao lado apenas como evidência crua.
--   • Escrita com service_role (rotas de API, n8n) não tem e-mail no JWT.
--     Fica registrada como 'service_role', não como nulo sem explicação.
--   • Escrita direta (Studio, psql, cron) não tem JWT nenhum: 'sql_direto',
--     com `current_user` em ator_role.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_auditoria_mudanca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_antes jsonb;
  v_depois jsonb;
  v_linha jsonb;
  v_claims jsonb;
  v_email text;
  v_origem text;
  v_role text;
  v_ator_id uuid;
  v_ator_nome text;
  v_sujeito_tipo text;
  v_sujeito_id uuid;
  v_sujeito_rotulo text;
  v_sujeito_email text;
  v_setor_id uuid;
  v_setor_nome text;
BEGIN
  v_antes := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_depois := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_linha := COALESCE(v_depois, v_antes);

  -- ── SUJEITO: que espécie de coisa esta linha descreve, e qual é o id dela.
  CASE TG_TABLE_NAME
    WHEN 'colaboradores' THEN
      v_sujeito_tipo := 'colaborador';
      v_sujeito_id := public.auditoria_uuid(v_linha ->> 'id');
    WHEN 'colaboradores_subsetores', 'colaboradores_setores', 'colaborador_setores' THEN
      v_sujeito_tipo := 'colaborador';
      v_sujeito_id := public.auditoria_uuid(v_linha ->> 'colaborador_id');
    WHEN 'setores' THEN
      v_sujeito_tipo := 'setor';
      v_sujeito_id := public.auditoria_uuid(v_linha ->> 'id');
    WHEN 'subsetores' THEN
      v_sujeito_tipo := 'subsetor';
      v_sujeito_id := public.auditoria_uuid(v_linha ->> 'id');
    WHEN 'setor_canais' THEN
      v_sujeito_tipo := 'canal';
      v_sujeito_id := public.auditoria_uuid(v_linha ->> 'id');
    WHEN 'permissoes' THEN
      v_sujeito_tipo := 'permissao';
      v_sujeito_id := public.auditoria_uuid(v_linha ->> 'id');
    WHEN 'setor_destinos_transferencia' THEN
      v_sujeito_tipo := 'transferencia';
      v_sujeito_id := public.auditoria_uuid(v_linha ->> 'id');
    ELSE
      -- Trigger instalado em tabela que este mapa não conhece: registra
      -- assim mesmo, com o sujeito marcado como não resolvido.
      v_sujeito_tipo := 'desconhecido';
      v_sujeito_id := public.auditoria_uuid(v_linha ->> 'id');
  END CASE;

  IF v_sujeito_tipo = 'colaborador' THEN
    -- Tabela de vínculo: o nome não está na linha, tem que ser buscado. No
    -- DELETE da própria `colaboradores` a busca não acha mais nada — daí o
    -- fallback para o jsonb, que ainda tem a linha inteira.
    SELECT c.nome, c.email INTO v_sujeito_rotulo, v_sujeito_email
    FROM public.colaboradores AS c
    WHERE c.id = v_sujeito_id;

    v_sujeito_rotulo := COALESCE(v_sujeito_rotulo, NULLIF(v_linha ->> 'nome', ''));
    v_sujeito_email := COALESCE(v_sujeito_email, NULLIF(v_linha ->> 'email', ''));

  ELSIF v_sujeito_tipo = 'transferencia' THEN
    -- Não tem nome: o que identifica a linha é o par origem → destino.
    v_sujeito_rotulo :=
      COALESCE(
        (SELECT s.nome FROM public.setores AS s
          WHERE s.id = public.auditoria_uuid(v_linha ->> 'setor_origem_id')),
        v_linha ->> 'setor_origem_id'
      )
      || ' -> ' ||
      COALESCE(
        (SELECT s.nome FROM public.setores AS s
          WHERE s.id = public.auditoria_uuid(v_linha ->> 'setor_destino_id')),
        v_linha ->> 'setor_destino_id'
      );

  ELSE
    -- setor, subsetor, canal, permissão: o nome está na própria linha.
    v_sujeito_rotulo := NULLIF(v_linha ->> 'nome', '');

    -- `setor_canais.nome` é opcional; sem ele, tipo e instância identificam.
    IF v_sujeito_rotulo IS NULL AND v_sujeito_tipo = 'canal' THEN
      v_sujeito_rotulo := NULLIF(
        concat_ws(' / ', v_linha ->> 'tipo', v_linha ->> 'instancia'), ''
      );
    END IF;
  END IF;

  -- ── CONTEXTO: em que setor isso aconteceu.
  IF TG_TABLE_NAME = 'setores' THEN
    v_setor_id := v_sujeito_id;
    v_setor_nome := v_sujeito_rotulo;
  ELSE
    v_setor_id := public.auditoria_uuid(
      COALESCE(v_linha ->> 'setor_id', v_linha ->> 'setor_origem_id')
    );

    -- Fica NULL quando a linha caiu por CASCADE do DELETE do próprio setor:
    -- nessa hora o setor já não existe. O nome está na linha de
    -- tabela = 'setores' do mesmo instante, com o mesmo contexto_setor_id.
    SELECT s.nome INTO v_setor_nome
    FROM public.setores AS s
    WHERE s.id = v_setor_id;
  END IF;

  -- ── ATOR: quem fez.
  -- Sem JWT o setting some, vem vazio ou vem o literal 'null' — os três
  -- significam a mesma coisa: escrita fora do PostgREST.
  v_claims := NULLIF(NULLIF(current_setting('request.jwt.claims', true), ''), 'null')::jsonb;
  IF jsonb_typeof(v_claims) IS DISTINCT FROM 'object' THEN
    v_claims := NULL;
  END IF;
  v_email := NULLIF(v_claims ->> 'email', '');

  IF v_claims IS NULL THEN
    v_origem := 'sql_direto';
    v_role := current_user;
  ELSIF COALESCE(v_claims ->> 'role', '') = 'service_role' THEN
    v_origem := 'service_role';
    v_role := 'service_role';
  ELSIF v_email IS NOT NULL THEN
    v_origem := 'usuario';
    v_role := v_claims ->> 'role';
  ELSE
    v_origem := 'desconhecido';
    v_role := v_claims ->> 'role';
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT c.id, c.nome INTO v_ator_id, v_ator_nome
    FROM public.colaboradores AS c
    WHERE lower(c.email) = lower(v_email)
    LIMIT 1;
  END IF;

  INSERT INTO public.auditoria_acesso_roteamento (
    tabela, operacao, linha_id,
    sujeito_tipo, sujeito_id, sujeito_rotulo, sujeito_email,
    contexto_setor_id, contexto_setor_nome,
    dados_antes, dados_depois,
    ator_origem, ator_email, ator_uid, ator_colaborador_id, ator_nome, ator_role
  ) VALUES (
    TG_TABLE_NAME, TG_OP, public.auditoria_uuid(v_linha ->> 'id'),
    v_sujeito_tipo, v_sujeito_id, v_sujeito_rotulo, v_sujeito_email,
    v_setor_id, v_setor_nome,
    public.auditoria_redigir(v_antes), public.auditoria_redigir(v_depois),
    v_origem,
    v_email,
    public.auditoria_uuid(v_claims ->> 'sub'),
    v_ator_id,
    v_ator_nome,
    v_role
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Auditoria é observação, não guarda. Se o registro falhar, a operação de
  -- negócio segue: só deixa o rastro no log do Postgres.
  RAISE WARNING 'auditoria_acesso_roteamento falhou em % %: %',
    TG_TABLE_NAME, TG_OP, SQLERRM;
  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- TRIGGERS — tabelas de VÍNCULO (quem atende o quê)
--
-- Volume baixo: são eventos de administração, não de operação.
--   colaboradores_subsetores → roteamento por subsetor (o caso relatado)
--   colaboradores_setores    → vínculo de atendimento (e a tag de operação)
--   colaborador_setores      → acesso do dashboard (tabela diferente, no
--                              singular; ver dashboard/colaboradores:658)
--
-- Um INSERT/DELETE em `colaboradores_setores` gera DOIS registros: o do
-- vínculo e o do UPDATE que os triggers de 20260525 fazem em
-- `colaboradores.setores_ativos_sessao`. É redundante de propósito — mostra
-- a cascata do jeito que ela aconteceu.
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_auditoria_colaboradores_subsetores ON public.colaboradores_subsetores;
CREATE TRIGGER trg_auditoria_colaboradores_subsetores
  AFTER INSERT OR UPDATE OR DELETE ON public.colaboradores_subsetores
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_mudanca();

DROP TRIGGER IF EXISTS trg_auditoria_colaboradores_setores ON public.colaboradores_setores;
CREATE TRIGGER trg_auditoria_colaboradores_setores
  AFTER INSERT OR UPDATE OR DELETE ON public.colaboradores_setores
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_mudanca();

DROP TRIGGER IF EXISTS trg_auditoria_colaborador_setores ON public.colaborador_setores;
CREATE TRIGGER trg_auditoria_colaborador_setores
  AFTER INSERT OR UPDATE OR DELETE ON public.colaborador_setores
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_mudanca();

-- ─────────────────────────────────────────────────────────────────────────
-- TRIGGERS — `colaboradores`
--
-- Aqui o UPDATE é FILTRADO, e isso não é economia: a tabela é escrita no
-- caminho quente (last_heartbeat a cada batida, is_online, foto_url,
-- last_ticket_received_at). Auditar UPDATE cru geraria dezenas de milhares de
-- linhas por dia de ruído e amplificaria escrita num banco compartilhado com
-- produção. Só interessa o que muda o que a pessoa pode fazer e onde ela
-- atende: ativo, permissao_id, setor_id (legado), is_master e
-- setores_ativos_sessao — este último é o irmão do vínculo de subsetor,
-- também decide se o ticket chega.
--
-- INSERT e DELETE não precisam de filtro: acontecem uma vez por conta.
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_auditoria_colaboradores_ins_del ON public.colaboradores;
CREATE TRIGGER trg_auditoria_colaboradores_ins_del
  AFTER INSERT OR DELETE ON public.colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_mudanca();

DROP TRIGGER IF EXISTS trg_auditoria_colaboradores_upd ON public.colaboradores;
CREATE TRIGGER trg_auditoria_colaboradores_upd
  AFTER UPDATE OF ativo, permissao_id, setor_id, is_master, setores_ativos_sessao
  ON public.colaboradores
  FOR EACH ROW
  WHEN (
    OLD.ativo IS DISTINCT FROM NEW.ativo
    OR OLD.permissao_id IS DISTINCT FROM NEW.permissao_id
    OR OLD.setor_id IS DISTINCT FROM NEW.setor_id
    OR OLD.is_master IS DISTINCT FROM NEW.is_master
    OR OLD.setores_ativos_sessao IS DISTINCT FROM NEW.setores_ativos_sessao
  )
  EXECUTE FUNCTION public.registrar_auditoria_mudanca();

-- ─────────────────────────────────────────────────────────────────────────
-- TRIGGERS — tabelas de CONFIGURAÇÃO (por onde o ticket entra e para onde vai)
--
-- Aqui a exclusão silenciosa é pior do que na de vínculo: tirar o subsetor de
-- um atendente some com UMA pessoa da fila; apagar o SETOR leva junto, por
-- ON DELETE CASCADE, os subsetores, os canais, os destinos de transferência e
-- todos os vínculos de todo mundo. É a mudança mais destrutiva do sistema e
-- hoje não deixa rastro nenhum.
--
--   setores                      → o setor em si; o DELETE cascateia em tudo
--   subsetores                   → destino do roteamento por subsetor
--   setor_canais                 → por onde a mensagem entra e sai (instância,
--                                  credencial); mexer aqui derruba canal
--   permissoes                   → o que cada papel pode fazer
--   setor_destinos_transferencia → para onde o ticket pode ser transferido
--
-- INSERT, UPDATE e DELETE crus: são todas de volume administrativo, e num
-- UPDATE de configuração o que interessa é justamente qual campo virou o quê.
--
-- Na CASCATA do DELETE de um setor, cada linha filha vira um registro próprio,
-- todos com o mesmo `contexto_setor_id`. O `contexto_setor_nome` das filhas
-- vem NULL — o setor já saiu da tabela quando o trigger delas roda; o nome
-- está no registro de `tabela = 'setores'` do mesmo instante.
--
-- FICAM DE FORA, de propósito: error_logs, notificacoes, push_subscriptions.
-- Alto volume e baixo valor forense — incluir afogaria a trilha e ninguém
-- acharia mais o que procura.
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_auditoria_setores ON public.setores;
CREATE TRIGGER trg_auditoria_setores
  AFTER INSERT OR UPDATE OR DELETE ON public.setores
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_mudanca();

DROP TRIGGER IF EXISTS trg_auditoria_subsetores ON public.subsetores;
CREATE TRIGGER trg_auditoria_subsetores
  AFTER INSERT OR UPDATE OR DELETE ON public.subsetores
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_mudanca();

DROP TRIGGER IF EXISTS trg_auditoria_setor_canais ON public.setor_canais;
CREATE TRIGGER trg_auditoria_setor_canais
  AFTER INSERT OR UPDATE OR DELETE ON public.setor_canais
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_mudanca();

DROP TRIGGER IF EXISTS trg_auditoria_permissoes ON public.permissoes;
CREATE TRIGGER trg_auditoria_permissoes
  AFTER INSERT OR UPDATE OR DELETE ON public.permissoes
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_mudanca();

DROP TRIGGER IF EXISTS trg_auditoria_setor_destinos_transferencia ON public.setor_destinos_transferencia;
CREATE TRIGGER trg_auditoria_setor_destinos_transferencia
  AFTER INSERT OR UPDATE OR DELETE ON public.setor_destinos_transferencia
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_mudanca();

-- ─────────────────────────────────────────────────────────────────────────
-- LEITURA — view com os nomes já resolvidos
--
-- Escolhemos view + consulta no Studio em vez de tela: a pergunta é de
-- investigação pontual ("quem tirou o subsetor da fulana na terça?", "quem
-- apagou o setor X?"), quem pergunta é operação/admin, e uma tela obrigaria a
-- expor a trilha ao navegador — superfície nova, sem ganho.
--
-- `setor` sai da coluna denormalizada, não de join: é o que mantém a resposta
-- de pé depois que o setor for apagado. `subsetor` ainda vem de join porque
-- só interessa enquanto ele existe — quando o subsetor é apagado, o nome dele
-- está no registro de `tabela = 'subsetores'` do mesmo instante.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_auditoria_acesso_roteamento AS
SELECT
  log.criado_em,
  log.tabela,
  log.operacao,
  log.sujeito_tipo,
  COALESCE(log.sujeito_rotulo, log.sujeito_email, log.sujeito_id::text) AS sujeito,
  log.contexto_setor_nome AS setor,
  subsetor.nome AS subsetor,
  COALESCE(log.ator_nome, log.ator_email, log.ator_origem) AS ator,
  log.ator_origem,
  log.ator_email,
  log.dados_antes,
  log.dados_depois,
  log.sujeito_id,
  log.sujeito_email,
  log.contexto_setor_id,
  log.ator_colaborador_id,
  log.ator_uid,
  log.linha_id,
  log.id
FROM public.auditoria_acesso_roteamento AS log
LEFT JOIN public.subsetores AS subsetor
  ON subsetor.id = public.auditoria_uuid(
       COALESCE(log.dados_depois ->> 'subsetor_id', log.dados_antes ->> 'subsetor_id')
     );

COMMENT ON VIEW public.vw_auditoria_acesso_roteamento IS
  'Leitura da trilha de acesso e roteamento, com sujeito, ator, setor e subsetor já resolvidos. Uso: Studio.';

REVOKE ALL ON public.vw_auditoria_acesso_roteamento FROM anon, authenticated;
GRANT SELECT ON public.vw_auditoria_acesso_roteamento TO service_role;

COMMIT;
