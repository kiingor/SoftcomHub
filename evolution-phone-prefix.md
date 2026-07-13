# Prefixo 55 no envio Evolution

## Objetivo
Remover temporariamente o banner automático de Web Push e garantir que mensagens manuais do Workdesk sejam enviadas pela Evolution com `55 + DDD + número`.

## Tarefas
- [x] Localizar a montagem do destinatário no fluxo Workdesk → Evolution.
- [x] Remover o banner automático das áreas autenticadas.
- [x] Normalizar o telefone com um único prefixo `55`.
- [x] Cobrir celular, telefone fixo e número já prefixado.
- [x] Validar TypeScript e build.

## Concluído quando
- [x] O banner “Ative os avisos do SoftcomHub” não aparecer.
- [x] `DDD + número` chegar à Evolution com `55` na frente.
- [x] Número iniciado por `55` não receber prefixo duplicado.
