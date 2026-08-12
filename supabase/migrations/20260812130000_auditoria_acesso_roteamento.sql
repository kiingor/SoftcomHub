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

COMMIT;
