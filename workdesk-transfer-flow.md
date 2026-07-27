# Transferência guiada no Workdesk

## Objetivo
Substituir as abas atuais por um fluxo único: setor, subsetor e fila ou atendente compatível.

## Tarefas
- [x] Mapear estados, consultas e contrato da API atual.
- [x] Refatorar o modal e seus estados no `app/workdesk/page.tsx`.
- [x] Preservar o subsetor ao transferir diretamente para atendente compatível.
- [x] Validar TypeScript, build, UX e acessibilidade.
- [x] Testar o fluxo no Workdesk local e gerar o preview.

## Concluído quando
- [x] O destino fica claro antes da confirmação e nenhuma regra de fila é perdida.

## Observação
O ESLint não executa porque o projeto ainda não possui configuração compatível com a versão instalada.
