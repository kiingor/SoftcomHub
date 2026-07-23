# Solicitação de desenvolvimento — Correções do WorkDesk e Dashboard

**Data:** 23/07/2026  
**Prioridade:** Alta  
**Status:** Bloqueado para publicação até correção dos itens P1  
**Origem:** Auditoria de `ajustes-workdesk-dashboard-2026-07-23.md`

## Objetivo

Corrigir os riscos encontrados nas alterações do WorkDesk, Dashboard e tela de Setor antes de integrá-las à `main`, preservando as funcionalidades Nexus já publicadas e evitando falhas de configuração, mensagens com status incorreto, reenvios indevidos e transferências sem autorização setorial.

## Resultado esperado

- A base de desenvolvimento deve partir da `main` atual.
- Nenhuma configuração do setor pode falhar por ausência de coluna no banco.
- Mensagens novas devem possuir estado de envio explícito e confiável.
- Reenvio deve ser permitido somente para a mensagem e o ticket corretos.
- Supervisores devem atuar somente nos setores aos quais possuem acesso.
- A trava de ordenação deve respeitar o setor de cada ticket.
- Transferências para atendentes indisponíveis devem ser confirmadas e validadas no servidor.
- As alterações devem possuir testes automatizados antes da publicação.

## P1 — Correções obrigatórias

### 1. Atualizar a base com a `main`

A branch atual está dois commits atrás da `main`. Antes de continuar:

1. Integrar a `main` atual.
2. Preservar a paginação e o histórico do Nexus.
3. Preservar o encerramento sem ticket após 25 minutos.
4. Preservar o Service Desk como setor principal no canal compartilhado com a Ouvidoria.
5. Não reintroduzir `nexus_ocorrencias`.

**Critérios de aceite:**

- A branch contém o commit atual da `main` ou um descendente dele.
- Todos os testes existentes na `main` continuam passando.
- O build final não volta a expor `/api/nexus/ocorrencia`.
- Service Desk continua sendo o principal do número compartilhado com a Ouvidoria.

### 2. Corrigir o rollout de `travar_ordenacao_chat`

Produção ainda não possui `setores.travar_ordenacao_chat`, mas o frontend envia a propriedade em todo salvamento de configurações. Isso faz o `UPDATE` inteiro falhar.

Implementar uma das opções abaixo:

- Preferencial: aplicar primeiro uma migration aditiva e somente depois publicar a UI.
- Alternativa temporária: ocultar/desabilitar a funcionalidade e omitir a propriedade do payload enquanto a coluna não estiver disponível.

Schema recomendado:

```sql
ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS travar_ordenacao_chat BOOLEAN;

UPDATE public.setores
SET travar_ordenacao_chat = FALSE
WHERE travar_ordenacao_chat IS NULL;

ALTER TABLE public.setores
  ALTER COLUMN travar_ordenacao_chat SET DEFAULT FALSE,
  ALTER COLUMN travar_ordenacao_chat SET NOT NULL;
```

**Atenção:** não executar migration em produção sem aprovação explícita. Testar primeiro em uma cópia ou ambiente controlado.

**Critérios de aceite:**

- Salvar qualquer configuração funciona antes e depois da ativação da feature.
- A coluna ausente nunca invalida o restante do formulário.
- A UI não informa que a trava está ativa se o banco não suporta a configuração.

### 3. Tornar o status de envio confiável

Atualmente, a mensagem é inserida com `status_envio = NULL`. Se o processo for interrompido antes da resposta do provedor, a interface interpreta `NULL` como mensagem enviada.

Implementar estados explícitos:

```text
pendente | enviado | falhou | indeterminado
```

Regras:

- Toda mensagem nova deve ser inserida como `pendente`.
- Somente `enviado` pode exibir confirmação de sucesso.
- Erro HTTP confirmado deve resultar em `falhou`.
- Queda de conexão após o disparo, quando não é possível saber se o provedor recebeu, deve resultar em `indeterminado`.
- Falha ao persistir o status deve ser tratada e registrada.
- O endpoint servidor que chama o provedor deve ser a fonte autoritativa do status.
- `erro_envio` deve ser limpo após sucesso confirmado.
- Registros legados com `NULL` não devem ser confundidos com mensagens novas pendentes.

Adicionar constraint compatível com o rollout escolhido. Evitar backfill massivo sem análise, pois produção possui grande volume de mensagens legadas com status nulo.

**Critérios de aceite:**

- Uma mensagem nova nunca permanece `NULL`.
- Recarregar a página durante um envio não mostra sucesso falso.
- Falha de persistência não é escondida apenas por uma atualização otimista da interface.
- Usuário autenticado sem autorização sobre o ticket não consegue alterar o status diretamente.

### 4. Restringir e tornar o reenvio idempotente

O histórico carrega mensagens de tickets anteriores. O botão de reenvio não pode funcionar para ticket encerrado ou diferente do ticket atual.

Permitir retry somente quando:

- `msg.ticket_id === selectedTicket.id`;
- o ticket está ativo;
- a mensagem é de saída do colaborador;
- o colaborador ainda está autorizado no ticket;
- não existe outra tentativa em andamento para a mesma mensagem.

O servidor deve repetir todas essas validações. Também deve:

- preservar `reply_to_message_id`;
- usar chave de idempotência ou lock por mensagem;
- impedir dois retries simultâneos;
- não reenviar automaticamente quando o estado for `indeterminado` sem antes consultar o provedor ou solicitar confirmação apropriada.

**Critérios de aceite:**

- Tickets anteriores e encerrados nunca exibem retry acionável.
- Clique duplo não gera duas entregas.
- Uma resposta citada continua citada após o retry.
- Perda da resposta HTTP não transforma automaticamente a tentativa em falha confirmada.

### 5. Restringir transferência de Supervisor aos seus setores

`can_see_all_tickets` não deve conceder transferência global.

Regras:

- `is_master = true`: acesso global.
- Supervisor: pode transferir apenas tickets cujo setor de origem esteja entre seus setores autorizados.
- Atendente comum: continua limitado aos tickets permitidos pela regra atual.
- O servidor deve validar o vínculo; a interface não é controle de segurança.

**Critérios de aceite:**

- Supervisor do Setor A pode transferir tickets do Setor A.
- Supervisor do Setor A recebe `403` ao tentar transferir ticket do Setor B.
- Master continua podendo transferir tickets de qualquer setor.
- A chamada direta da API respeita as mesmas regras da interface.

### 6. Validar atendente pausado/offline no servidor

A confirmação atual acontece somente no navegador e pode usar informação desatualizada.

Fluxo esperado:

1. O servidor verifica `ativo`, `is_online`, `pausa_atual_id` e heartbeat no momento da transferência.
2. Se o destino estiver indisponível e não houver confirmação explícita, retorna um código estável, por exemplo `TARGET_UNAVAILABLE`.
3. A interface exibe a confirmação.
4. Após confirmação, repete a solicitação com `allow_unavailable: true`.
5. O servidor revalida o estado e registra que a transferência foi forçada.

**Critérios de aceite:**

- Uma pausa iniciada após a abertura do modal ainda exige confirmação.
- Chamada direta sem `allow_unavailable` não ignora a confirmação.
- O log da transferência informa quando o destino estava pausado ou offline.

### 7. Aplicar a ordenação por setor do ticket

Não usar apenas `colab.setor_id` ou o primeiro setor vinculado.

Implementação esperada:

- Carregar `travar_ordenacao_chat` para todos os setores presentes na lista.
- Determinar a chave de ordenação usando `ticket.setor_id`.
- Dentro de um setor travado, ordenar por `criado_em`.
- Dentro de um setor não travado, ordenar por `ultima_mensagem_em`, com fallback para `criado_em`.
- Documentar o comportamento da lista quando o atendente possui tickets de vários setores.

**Critérios de aceite:**

- Mensagem nova não muda a ordem relativa dos tickets de um setor travado.
- Mensagem nova continua promovendo o ticket no setor não travado.
- A configuração de um setor nunca altera o comportamento dos tickets de outro setor.
- A ordem não depende do primeiro vínculo retornado pelo banco.

## P2 — Ajustes importantes

### Pausas

- Validar `tempo_maximo_minutos` como inteiro não negativo ou `NULL`.
- Não aceitar decimal, `NaN` ou valor negativo.
- Comparar o tempo em milissegundos, evitando atraso de quase um minuto no alerta.
- Não mostrar `Pausa · null` quando os detalhes não forem carregados.
- Adicionar constraint no banco:

```sql
CHECK (
  tempo_maximo_minutos IS NULL
  OR tempo_maximo_minutos >= 0
)
```

### Fila/subsetor

- Aplicar o mesmo fallback nas duas tabelas do monitoramento.
- Conforme a especificação atual, o fallback deve ser `Suporte`.
- Confirmar com produto se esse fallback é válido também para setores Financeiro, Comercial e Ouvidoria.

### Link para ocorrência

- Manter a remoção do DDI `55`.
- Preferir link nativo:

```html
<a target="_blank" rel="noopener noreferrer">
```

- Preservar CNPJ, telefone, registro e número do ticket corretamente codificados.

### Acessibilidade

- Associar um `Label` ou `aria-label` ao switch de trava de ordenação.
- Garantir navegação por teclado e estado de foco visível.

### Banco e migrations

- Usar timestamps únicos nos nomes das migrations.
- Qualificar tabelas com `public`.
- Reconciliar a migration aplicada manualmente com o histórico do Supabase antes de usar `db push`.
- Não considerar o script atual de diagnóstico como validação completa de tipo, constraint, RLS ou histórico de migrations.

## Alterações fora do escopo que devem ser separadas

O mesmo working tree contém mudanças não descritas no pedido:

- remoção da capacidade do atendente alterar seus próprios subsetores;
- ativação de corretor e capitalização automática;
- mudanças de provedor de IA;
- importação de `lib/ai-provider.ts`;
- scripts de diagnóstico não relacionados.

Essas alterações devem ser:

1. removidas deste pacote; ou
2. documentadas, revisadas e testadas em solicitação/commit separado.

Não commitar apenas os arquivos listados no resumo enquanto existirem imports de arquivos não rastreados.

## Testes automatizados obrigatórios

### API e autorização

- Supervisor transfere ticket de setor permitido.
- Supervisor não transfere ticket de outro setor.
- Master transfere ticket de qualquer setor.
- Atendente pausado exige override explícito.
- Mudança de disponibilidade entre abertura do modal e envio da requisição.

### Mensagens

- Estado inicial `pendente`.
- Sucesso altera para `enviado`.
- Erro confirmado altera para `falhou`.
- Resposta perdida altera para `indeterminado`.
- Reload durante o envio não mostra sucesso.
- Falha no update do status é apresentada/registrada.
- Retry em ticket anterior ou encerrado é bloqueado.
- Retry simultâneo não duplica a mensagem.
- Retry preserva mensagem citada.

### Ordenação

- Setor travado mantém ordem por criação.
- Setor destravado ordena por última atividade.
- Atendente multissetor respeita a configuração individual de cada setor.
- Coluna ausente não quebra salvamento de configurações.

### Pausas e monitoramento

- Alerta muda exatamente após o limite configurado.
- Pausa sem limite não fica vermelha.
- Dados de pausa ausentes não exibem `null`.
- Fallback de subsetor é igual nas duas tabelas.

## Gate de publicação

Antes da subida:

- [ ] Branch integrada com a `main` atual.
- [ ] P1 corrigidos.
- [ ] Migrations testadas fora de produção.
- [ ] Aprovação explícita antes de qualquer migration em produção.
- [ ] Testes existentes da `main` passando.
- [ ] Novos testes acima passando.
- [ ] `npx tsc --noEmit` passando.
- [ ] `npm run build` passando.
- [ ] `git diff --check` passando.
- [ ] Validação manual do WorkDesk em desktop e mobile.
- [ ] Teste manual de Supervisor restrito ao setor.
- [ ] Teste de reload durante envio.
- [ ] Plano de rollback registrado.

## Ordem recomendada de publicação

1. Atualizar a branch com a `main`.
2. Corrigir e testar migrations em ambiente controlado.
3. Aplicar migrations aditivas após aprovação.
4. Publicar validações e persistência no backend.
5. Publicar frontend.
6. Validar os fluxos críticos.
7. Monitorar erros de envio, transferências e salvamento de setor.

## Rollback

- Reverter a aplicação para o commit anterior.
- Manter as colunas aditivas no banco; não remover colunas com dados durante o rollback.
- Desabilitar/ocultar a trava de ordenação se o backend ou schema não estiverem disponíveis.
- Não realizar backfill destrutivo durante uma emergência.

## Definição de pronto

O desenvolvimento será considerado concluído quando todos os critérios P1 estiverem atendidos, os testes automatizados forem incluídos, o código estiver integrado à `main` atual e a publicação não depender de alteração manual não registrada no banco.
