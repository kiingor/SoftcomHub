# Web Push no SoftcomHub

## Objetivo
Ativar Web Push ao abrir Dashboard/Workdesk e entregar alertas de instância desconectada por setor e novas mensagens de clientes com prévia.

> O banner automático de ativação está temporariamente desabilitado até a configuração das chaves VAPID.

## Tarefas
- [x] Mapear assinatura, service worker e destinatários atuais.
- [x] Exibir solicitação de ativação no Dashboard e Workdesk.
- [x] Restringir alerta de instância aos gestores vinculados ao setor.
- [x] Enviar ao atendente atribuído nome do cliente e prévia da mensagem.
- [x] Validar tipos, build possível e comportamento do service worker.

## Concluído quando
- [x] A permissão pode ser ativada ao abrir as áreas autenticadas.
- [x] O clique abre o setor ou ticket correto.
- [x] Assinaturas inválidas são removidas sem quebrar o envio.
