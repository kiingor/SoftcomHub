# Auditoria de acesso e roteamento

Responde "quem mudou o quê, quando, e do que para o quê" nas tabelas que
decidem **quem atende** e **por onde o ticket entra e vai**.

## Sequência de aplicação

**Aplicação é manual, no SQL Editor do Supabase Studio** — o TLS corporativo
bloqueia conexão direta no Postgres, então nada disso sobe por linha de comando.
O banco é **compartilhado com produção**: aplicar já vale em prod no instante do
Run.

| | Passo | Onde |
|---|---|---|
| 1 | Pré-flight (abaixo) | Studio |
| 2 | `20260812130100_auditoria_indice_colaboradores_email.sql` — **sozinho**, sem nenhum outro comando junto | Studio |
| 3 | `20260812130000_auditoria_acesso_roteamento.sql` — **uma submissão só** (tem `BEGIN`/`COMMIT` próprios) | Studio |
| 4 | Validação — [os testes com `ROLLBACK`](#como-validar-depois-de-aplicar) | Studio |
| 5 | Merge do PR | GitHub |

O índice tem o número **maior** do par mas roda **primeiro**: o número só
reflete a ordem em que os dois nasceram. Vir antes não é obrigatório — é só
melhor, porque assim os triggers nunca chegam a fazer seq scan em
`colaboradores` na janela entre um arquivo e outro. Ele é
`CREATE INDEX CONCURRENTLY`: não roda dentro de bloco transacional, por isso não
pode dividir submissão com nada.

### Antes ou depois do merge? Antes.

Nenhum arquivo de app depende disto — nada no repositório lê a tabela nova.

- **Aplicado e não mergeado** é invisível para a aplicação: os triggers já
  começam a coletar, e se algo se comportar mal basta derrubar os triggers, sem
  reverter commit mergeado.
- **Mergeado e não aplicado** é o estado ruim: a `main` passa a dizer que a
  trilha existe enquanto ela não existe.

### Janela

`CREATE TRIGGER` pega `SHARE ROW EXCLUSIVE`, que conflita com o
`ROW EXCLUSIVE` de todo INSERT/UPDATE/DELETE — e, como o passo 3 é uma
transação só, o lock em `colaboradores` fica segurado até o `COMMIT`. Rode fora
do horário de pico. O `SET LOCAL lock_timeout = '5s'` faz abortar rápido em vez
de empilhar fila, e **abortar é seguro**: ou os 10 triggers entram, ou nenhum
entra. O arquivo é re-executável.

### Pré-flight

A lista de tabelas saiu de `scripts/migration-completa.sql`, que é um retrato do
schema e não necessariamente a verdade atual do banco. Se qualquer nome não
bater, o `CREATE TRIGGER` falha e derruba a transação inteira.

```sql
-- As 9 tabelas existem com esse nome exato? Nenhuma pode vir NULL.
SELECT nome, to_regclass('public.' || nome) AS existe
FROM unnest(ARRAY[
  'colaboradores', 'colaboradores_setores', 'colaborador_setores',
  'colaboradores_subsetores', 'setores', 'subsetores', 'setor_canais',
  'permissoes', 'setor_destinos_transferencia'
]) AS nome;

-- As 5 colunas do trigger filtrado de colaboradores. Tem que voltar 5 linhas.
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'colaboradores'
  AND column_name IN ('ativo', 'permissao_id', 'setor_id', 'is_master',
                      'setores_ativos_sessao');

-- Nada colide? Os três vêm NULL numa aplicação limpa.
SELECT to_regclass('public.auditoria_acesso_roteamento')    AS tabela,
       to_regproc('public.registrar_auditoria_mudanca')     AS funcao,
       to_regclass('public.vw_auditoria_acesso_roteamento') AS visao;
```

### Desfazer

O bloco `DESFAZER`, comentado no fim de
`20260812130000_auditoria_acesso_roteamento.sql`, traz os `DROP` prontos. A
reação mais barata é derrubar **só os triggers**: a coleta para na hora e o
histórico já gravado continua consultável pela view.

## O que é gravado

Trigger `AFTER INSERT OR UPDATE OR DELETE` em duas famílias de tabela.

**Vínculo — quem atende o quê:**

| Tabela | O que significa |
|---|---|
| `colaboradores_subsetores` | roteamento por subsetor — o caso relatado |
| `colaboradores_setores` | vínculo de atendimento (e a tag de operação) |
| `colaborador_setores` | acesso ao dashboard (tabela no singular, outra coisa) |
| `colaboradores` | `ativo`, `permissao_id`, `setor_id`, `is_master`, `setores_ativos_sessao` |

**Configuração — por onde o ticket entra e para onde vai:**

| Tabela | Por que importa |
|---|---|
| `setores` | o `DELETE` cascateia em subsetores, canais, destinos e em todos os vínculos |
| `subsetores` | destino do roteamento por subsetor |
| `setor_canais` | instância e credencial: mexer aqui derruba canal |
| `permissoes` | o que cada papel pode fazer |
| `setor_destinos_transferencia` | para onde o ticket pode ser transferido |

**Ficam de fora de propósito:** `error_logs`, `notificacoes`,
`push_subscriptions`. Alto volume e baixo valor forense — incluir afogaria a
trilha e ninguém acharia mais o que procura.

Em `colaboradores` o UPDATE é filtrado por aquelas cinco colunas. A tabela é
escrita no caminho quente (`last_heartbeat`, `is_online`, `foto_url`,
`last_ticket_received_at`); auditar UPDATE cru viraria dezenas de milhares de
linhas de ruído por dia. Nas demais tabelas o UPDATE é cru — são todas de
volume administrativo.

Cada registro guarda a linha inteira antes e depois (`dados_antes`,
`dados_depois`, jsonb), quem fez e quando.

## O sujeito: colaborador é um caso particular, não o formato

Numa tabela de vínculo o sujeito da linha é a **pessoa**. Numa de configuração
é o **setor**, o **subsetor**, o **canal**, a **permissão**. Uma coluna
`colaborador_id` só serviria à primeira família — na segunda ela guardaria o id
do setor num campo que diz "colaborador", e o registro passaria a mentir sobre
o que descreve.

Por isso o sujeito é genérico:

| Coluna | O que é |
|---|---|
| `sujeito_tipo` | `colaborador`, `setor`, `subsetor`, `canal`, `permissao`, `transferencia` |
| `sujeito_id` | o id do sujeito |
| `sujeito_rotulo` | o nome legível, **resolvido no instante da escrita** |
| `sujeito_email` | só colaborador tem; `NULL` nas de configuração |

O tipo é decidido pela **tabela**, num mapa explícito dentro de
`registrar_auditoria_mudanca()`. Não é adivinhado por nome de coluna.

O rótulo vem da **própria linha** (`to_jsonb(OLD) ->> 'nome'`) sempre que a
tabela carrega o nome. É isso que faz o `DELETE` continuar legível: quando o
trigger roda, a linha já saiu da tabela e um `SELECT` não acharia mais nada.
Para as tabelas de vínculo, onde o nome não está na linha, ele é buscado em
`colaboradores` e gravado junto.

`setor_destinos_transferencia` não tem nome nenhum: o rótulo vira
`"Origem -> Destino"`, com os dois nomes resolvidos na hora.

Além do sujeito, cada registro guarda `contexto_setor_id` e
`contexto_setor_nome` — "em que setor isso aconteceu", sem join e sobrevivendo
ao setor sumir.

### A cascata do DELETE de setor

Apagar um setor gera **um registro por linha derrubada**, todos com o mesmo
`contexto_setor_id`. Nas linhas filhas o `contexto_setor_nome` vem `NULL`: o
setor já saiu da tabela quando o trigger delas roda. O nome está no registro de
`tabela = 'setores'` do mesmo instante — é a linha que responde quem apagou.

```sql
-- Tudo que caiu junto com um setor
SELECT criado_em, tabela, operacao, sujeito_tipo, sujeito, ator
FROM public.vw_auditoria_acesso_roteamento
WHERE contexto_setor_id = '<uuid do setor>'
ORDER BY criado_em DESC;
```

## Credencial não é copiada

`setores` e `setor_canais` guardam credencial em coluna comum:
`whatsapp_token`, `evolution_api_key`, `discord_bot_token` e `webhook_url` (o do
Discord já traz o token na própria URL). Copiar a linha inteira para a auditoria
criaria uma **segunda cópia** de cada credencial — e, no `DELETE`, uma cópia que
sobrevive à original para sempre.

`auditoria_redigir()` troca esses quatro campos por
`[redigido:<8 hex do md5>]`. Não dá para ler o segredo, mas antes e depois
continuam **diferentes quando ele muda** — trocar uma chave em silêncio
continua aparecendo na trilha, que é o ponto.

## Quem fez — como o ator é resolvido

| Origem | Quando | O que dá para saber |
|---|---|---|
| `usuario` | escrita do navegador, JWT de usuário | e-mail, nome e id do colaborador |
| `service_role` | rota de API, n8n, cron | que foi o sistema — não dá para saber a pessoa |
| `sql_direto` | Studio, psql | `current_user` em `ator_role` |
| `desconhecido` | JWT sem e-mail e sem role conhecida | só o que veio no token |

A chave é o **e-mail do JWT**, não o `auth.uid()`. `colaboradores.id` não é
garantidamente o `auth.uid()`: `app/dashboard/colaboradores/page.tsx` cria a
linha com `id: authData.user.id`, enquanto `app/setor/[id]/page.tsx` insere sem
`id` e deixa o DEFAULT gerar outro uuid. Por isso o app inteiro resolve
colaborador por e-mail (`useColaborador`, `requireAdmin`). O `auth.uid()` fica
gravado em `ator_uid` só como evidência crua.

## Por que trigger, e não log no app

Essas tabelas são escritas **direto do navegador** via supabase-js, sem passar
por rota nenhuma (`app/dashboard/colaboradores/page.tsx:633` e `649`,
`app/setor/[id]/page.tsx:1494` e `5402`). Log escrito pelo app só enxerga o
caminho que o app conhece, e é contornável chamando o PostgREST direto. O
trigger pega todos: UI, n8n, script avulso, Studio.

## Como ler

Pelo Studio, na view `vw_auditoria_acesso_roteamento` (sujeito, ator, setor e
subsetor já resolvidos).

```sql
-- Últimas mudanças
SELECT criado_em, tabela, operacao, sujeito_tipo, sujeito, setor, subsetor, ator, ator_origem
FROM public.vw_auditoria_acesso_roteamento
ORDER BY criado_em DESC
LIMIT 100;
```

```sql
-- "Tiraram o subsetor de fulano" — histórico de uma pessoa
SELECT criado_em, tabela, operacao, subsetor, setor, ator, ator_origem
FROM public.vw_auditoria_acesso_roteamento
WHERE sujeito_tipo = 'colaborador'
  AND (sujeito ILIKE '%fulano%' OR sujeito_email ILIKE '%fulano%')
ORDER BY criado_em DESC;
```

```sql
-- Só as remoções de subsetor, com quem removeu
SELECT criado_em, sujeito, subsetor, ator, ator_origem, ator_email
FROM public.vw_auditoria_acesso_roteamento
WHERE tabela = 'colaboradores_subsetores'
  AND operacao = 'DELETE'
ORDER BY criado_em DESC;
```

```sql
-- Quem apagou setor, subsetor ou canal
SELECT criado_em, tabela, sujeito_tipo, sujeito, setor, ator, ator_origem, ator_email
FROM public.vw_auditoria_acesso_roteamento
WHERE operacao = 'DELETE'
  AND sujeito_tipo IN ('setor', 'subsetor', 'canal')
ORDER BY criado_em DESC;
```

```sql
-- Canal mexido: qual campo virou o quê
SELECT criado_em, sujeito, setor, ator,
       dados_antes  ->> 'ativo'     AS ativo_antes,
       dados_depois ->> 'ativo'     AS ativo_depois,
       dados_antes  ->> 'instancia' AS instancia_antes,
       dados_depois ->> 'instancia' AS instancia_depois
FROM public.vw_auditoria_acesso_roteamento
WHERE tabela = 'setor_canais' AND operacao = 'UPDATE'
ORDER BY criado_em DESC;
```

```sql
-- Quem foi desativado ou trocou de permissão
SELECT criado_em, sujeito, ator,
       dados_antes  ->> 'ativo'        AS ativo_antes,
       dados_depois ->> 'ativo'        AS ativo_depois,
       dados_antes  ->> 'permissao_id' AS permissao_antes,
       dados_depois ->> 'permissao_id' AS permissao_depois
FROM public.vw_auditoria_acesso_roteamento
WHERE tabela = 'colaboradores' AND operacao = 'UPDATE'
ORDER BY criado_em DESC;
```

Não tem tela. A pergunta é de investigação pontual, quem pergunta é
operação/admin, e uma tela obrigaria a expor a trilha ao navegador — superfície
nova, sem ganho. A tabela e a view estão fechadas para `anon` e `authenticated`
(RLS ligada, sem policy); leitura é `service_role` ou Studio.

## Como validar depois de aplicar

No SQL Editor do Studio.

```sql
-- 1. Os dez triggers estão instalados?
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_name LIKE 'trg_auditoria%'
ORDER BY event_object_table, trigger_name;
```

```sql
-- 2. Vínculo: escrita direta é registrada como sql_direto.
--    Troque os uuids por um vínculo de teste real.
BEGIN;
DELETE FROM public.colaboradores_subsetores
WHERE colaborador_id = '<uuid>' AND subsetor_id = '<uuid>';

SELECT tabela, operacao, sujeito_tipo, sujeito, subsetor, setor, ator, ator_origem
FROM public.vw_auditoria_acesso_roteamento
ORDER BY criado_em DESC LIMIT 1;
ROLLBACK;   -- desfaz o DELETE E o registro de auditoria
```

```sql
-- 3. Configuração: o sujeito de `setores` é o SETOR, não um colaborador.
--    O setor descartável é criado DENTRO da transação: nenhuma linha de
--    produção é tocada nem travada enquanto você lê o resultado.
BEGIN;

INSERT INTO public.setores (id, nome)
VALUES ('00000000-0000-4000-8000-0000000000aa', 'ZZZ teste auditoria');

INSERT INTO public.subsetores (id, setor_id, nome)
VALUES ('00000000-0000-4000-8000-0000000000bb',
        '00000000-0000-4000-8000-0000000000aa', 'ZZZ sub teste');

DELETE FROM public.setores WHERE id = '00000000-0000-4000-8000-0000000000aa';

SELECT tabela, operacao, sujeito_tipo, sujeito,
       contexto_setor_id, contexto_setor_nome, ator, ator_origem
FROM public.vw_auditoria_acesso_roteamento
ORDER BY criado_em DESC LIMIT 10;

ROLLBACK;
```

Nunca use um setor de produção aqui: o `DELETE` cascateia em subsetores,
canais, destinos e nos vínculos de todo mundo daquele setor, e enquanto a
transação estiver aberta **todas essas linhas ficam travadas**.

O que tem que aparecer:

- `tabela = 'setores'` com `sujeito_tipo = 'setor'` e `sujeito` com o **nome**
  do setor, não um uuid — prova que o rótulo veio da própria linha e sobreviveu
  ao `DELETE`;
- `tabela = 'subsetores'` com o mesmo `contexto_setor_id` e
  `contexto_setor_nome` **`NULL`** — o comportamento documentado da cascata: o
  setor pai já saiu da tabela quando o trigger da filha roda.

Se algum `INSERT` falhar por coluna `NOT NULL` inesperada, a transação aborta
sozinha e o erro diz qual coluna falta.

```sql
-- 4. Credencial não vaza.
BEGIN;
UPDATE public.setor_canais SET nome = nome WHERE id = '<uuid de um canal>';

SELECT dados_depois ->> 'evolution_api_key' AS chave,
       dados_depois ->> 'whatsapp_token'    AS token
FROM public.vw_auditoria_acesso_roteamento
ORDER BY criado_em DESC LIMIT 1;   -- tem que vir '[redigido:xxxxxxxx]'
ROLLBACK;
```

```sql
-- 5. O UPDATE quente NÃO polui: as duas contagens têm que dar igual.
BEGIN;
SELECT count(*) FROM public.auditoria_acesso_roteamento;
UPDATE public.colaboradores SET last_heartbeat = now() WHERE id = '<uuid>';
SELECT count(*) FROM public.auditoria_acesso_roteamento;
ROLLBACK;
```

```sql
-- 6. Auditoria não derruba a operação.
--    Quebra a tabela de propósito e confirma que o vínculo ainda grava: o
--    trigger cai no EXCEPTION WHEN OTHERS, sai um WARNING no log do Postgres
--    e a operação de negócio passa.
BEGIN;
ALTER TABLE public.auditoria_acesso_roteamento RENAME TO auditoria_teste_quebrado;

INSERT INTO public.colaboradores_subsetores (colaborador_id, setor_id, subsetor_id)
VALUES ('<uuid>', '<uuid>', '<uuid>');

-- Chegou aqui sem erro? É exatamente o contrato: auditoria é observação,
-- não guarda.
SELECT 'operacao sobreviveu' AS resultado;
ROLLBACK;
```

Tudo numa sessão só, e tudo desfeito pelo `ROLLBACK`. **Não** faça isso
renomeando a tabela e indo mexer na UI em outra aba: o `ALTER` segura
`ACCESS EXCLUSIVE`, a sessão da UI ficaria travada esperando em vez de
exercitar o `EXCEPTION`, e no meio tempo toda escrita auditada perderia o
registro em silêncio.

## Pelo navegador (o teste que importa)

Abra `/setor/<id>` → Atendentes → tire e devolva um subsetor de um atendente de
teste. Depois:

```sql
SELECT criado_em, operacao, sujeito, subsetor, ator, ator_origem, ator_email
FROM public.vw_auditoria_acesso_roteamento
WHERE tabela = 'colaboradores_subsetores'
ORDER BY criado_em DESC LIMIT 5;
```

`ator_origem` tem que vir `usuario` e `ator` com o seu nome. Se vier
`ator_origem = 'usuario'` mas `ator` com o e-mail em vez do nome, é o caso de
`colaboradores.id` divergente descrito acima — o e-mail continua identificando
a pessoa.
