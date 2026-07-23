# Ajustes — WorkDesk / Dashboard / Setor (2026-07-23)

Resumo dos ajustes implementados nesta sessão, arquivos afetados e pendências.

## 1. Fila mostrando subsetor

A coluna "Fila" (antes "Setor / Subsetor") passou a mostrar o **subsetor** do ticket como valor principal, com fallback para **"Suporte"** (não mais o nome do setor) quando o ticket não tem subsetor definido.

- `app/dashboard/monitoramento/page.tsx` — tabelas "Aguardando" e "Em andamento".
- `app/setor/[id]/page.tsx` — mesmas duas tabelas, dentro da seção "Monitoramento".

## 2. Pausas — tempo configurável e exibição pro supervisor

- Cadastro de pausa (`/setor/[id]` → aba "Pausas") ganhou o campo **"Tempo máximo (minutos)"**, ligado à coluna `pausas.tempo_maximo_minutos` (já existia no banco, nunca tinha UI).
- Onde antes mostrava só "Em pausa"/"Ausente" (texto fixo, sem detalhe), agora mostra **nome da pausa + tempo decorrido**, com o indicador virando **vermelho** quando passa do tempo máximo configurado:
  - `app/dashboard/monitoramento/page.tsx` — aba "Atendentes".
  - `app/setor/[id]/page.tsx` — aba "Atendentes" dentro do card "Monitoramento detalhado" (antes mostrava "Ausente" fixo).

## 3. Abrir ocorrência em nova guia

- Botão "Abrir ticket" no WorkDesk agora abre a URL do Service Desk (`agenda.softcomtecnologia.com/service-desk/ocorrencia-rapida`) em **nova guia** do navegador, em vez do modal com iframe (removido por completo, junto com uma prop morta `onOpenTicketIframe`).
- O telefone enviado na URL agora tem o **DDI 55 removido** (só DDD + número), quando o número tem 12 ou 13 dígitos começando com 55.
- Arquivo: `app/workdesk/page.tsx`.

## 4. Trava de reordenação da lista de chats (setor decide) — **schema pendente**

- Novo toggle em `/setor/[id]` → "Configurações" → card "Ordenação de Conversas": **"Travar ordenação da lista de chats"**.
- Quando ativo, a lista de chats do WorkDesk para de subir conversas por atividade e passa a ordenar por data de criação do ticket (ordem fixa).
- **Pendente**: rodar no Supabase Studio —
  ```sql
  ALTER TABLE setores ADD COLUMN IF NOT EXISTS travar_ordenacao_chat BOOLEAN DEFAULT FALSE;
  ```
  (arquivo: `supabase/migrations/20260723_travar_ordenacao_chat_setores.sql`). Combinado que isso fica pra depois — o código já está pronto e não quebra nada enquanto a coluna não existir.

## 5. Telefone do cliente travado no WorkDesk

- No dialog "Editar Dados do Cliente", o campo Telefone agora é somente leitura (`readOnly`), e a coluna `telefone` foi removida do update enviado ao Supabase (blindagem extra).
- Arquivo: `app/workdesk/page.tsx`.

## 6. Log de envio de mensagem (enviado x falhou), persistido

- Novas colunas `mensagens.status_envio` (`'enviado' | 'falhou'`) e `mensagens.erro_envio` — **já aplicadas no banco**.
- Toda tentativa de envio (inicial e "Tentar novamente") grava o resultado no banco, não só em memória.
- A bolha do chat agora usa esse dado persistido quando não há mais o indicador temporário em memória — ou seja, **sobrevive a reload/F5** (antes, um envio que falhava voltava a parecer "enviado" normalmente depois de um refresh).
- Arquivo: `app/workdesk/page.tsx`. Migration: `supabase/migrations/20260723_status_envio_mensagens.sql`.

## 7. Filtro de atendentes aplicado em mais lugares

Selecionar atendentes no multi-seletor da Monitoramento (`atendenteFilter`) agora também filtra:

- A seção "Atendentes" completa do setor (gestão de atendentes).
- A aba "Atendentes" dentro do card "Monitoramento detalhado".

Arquivo: `app/setor/[id]/page.tsx`.

## 8. Bugs corrigidos (não relacionados aos pedidos originais, encontrados durante os testes)

- **Transferência de ticket bloqueada por permissão**: só o dono do ticket ou `is_master` podiam transferir; agora atendentes com a permissão **"Supervisor" (`can_see_all_tickets`)** também podem. Arquivo: `app/api/tickets/transferir/route.ts`.
- **Transferência para atendente em pausa bloqueada**: agora segue o mesmo fluxo já usado pra atendente offline — permite transferir com uma tela de confirmação ("Este atendente está em pausa, transferir mesmo assim?"), em vez de bloquear direto. Removido também um check morto no servidor que nunca disparava na prática. Arquivos: `app/workdesk/page.tsx`, `app/api/tickets/transferir/route.ts`.

## Arquivos alterados

- `app/dashboard/monitoramento/page.tsx`
- `app/setor/[id]/page.tsx`
- `app/workdesk/page.tsx`
- `app/api/tickets/transferir/route.ts`
- `supabase/migrations/20260723_travar_ordenacao_chat_setores.sql` (novo, pendente de rodar)
- `supabase/migrations/20260723_status_envio_mensagens.sql` (novo, já rodado)
- `scripts/verify-pausas-setores-colunas.mjs` (novo, script de diagnóstico)

## Pendências

- [ ] Rodar a migration do item 4 (`travar_ordenacao_chat`) quando quiser ativar aquela feature.

## Verificação

`tsc --noEmit` e `npm run build` rodados e sem erros após cada bloco de mudanças. Testado manualmente no dev server (`localhost:3001`).
