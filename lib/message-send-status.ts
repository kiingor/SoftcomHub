// Estado de exibição de uma mensagem enviada pelo atendente no WorkDesk.
//
// Existem duas fontes: um estado EFÊMERO em memória (Map de pendingMessages,
// só existe enquanto a página está aberta e o envio acabou de acontecer) e um
// estado PERSISTIDO no banco (mensagens.status_envio), que sobrevive a reload.
// O efêmero tem prioridade — é o feedback imediato de "enviando agora"; quando
// ele não existe mais (página recarregada, ou já passou o tempo de exibição do
// "enviado"), cai pro que está persistido.
export type EphemeralSendStatus = 'sending' | 'sent' | 'error' | undefined
export type PersistedSendStatus = 'pendente' | 'enviado' | 'falhou' | 'indeterminado' | null | undefined
export type SendOutcome = 'sending' | 'sent' | 'failed' | 'indeterminate' | 'pending' | 'normal'

export function computeSendOutcome(
  ephemeral: EphemeralSendStatus,
  persisted: PersistedSendStatus,
): SendOutcome {
  if (ephemeral === 'sending') return 'sending'
  if (ephemeral === 'sent') return 'sent'
  if (ephemeral === 'error') return 'failed'
  if (persisted === 'falhou') return 'failed'
  if (persisted === 'indeterminado') return 'indeterminate'
  if (persisted === 'pendente') return 'pending'
  // null/undefined (mensagem legada, anterior a essa coluna existir) é tratado
  // igual a 'enviado' — nunca mostra como falha ou pendência sem necessidade.
  return 'normal'
}
