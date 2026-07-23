// Autorização compartilhada pelas rotas de envio (whatsapp/evolution/discord) e pelo
// retry: garante que o ticket ainda está ativo e que quem está mandando a mensagem
// (envio novo ou reenvio) continua autorizado nele — o client já faz uma checagem
// similar, mas o servidor é quem decide de verdade.
export interface TicketSendAuthOk {
  ok: true
  ticket: { id: string; status: string; colaborador_id: string | null; setor_id: string }
}
export interface TicketSendAuthFail {
  ok: false
  status: number
  error: string
}
export type TicketSendAuthResult = TicketSendAuthOk | TicketSendAuthFail

export async function authorizeTicketSend(
  supabase: any,
  ticketId: string,
  userEmail: string,
): Promise<TicketSendAuthResult> {
  const [{ data: ticket, error: ticketError }, { data: actor, error: actorError }] = await Promise.all([
    supabase.from('tickets').select('id, status, colaborador_id, setor_id').eq('id', ticketId).maybeSingle(),
    supabase
      .from('colaboradores')
      .select('id, is_master, permissoes(can_see_all_tickets)')
      .eq('email', userEmail)
      .maybeSingle(),
  ])

  if (ticketError || actorError) {
    return { ok: false, status: 500, error: 'Erro ao validar autorização de envio' }
  }
  if (!ticket) {
    return { ok: false, status: 404, error: 'Ticket não encontrado' }
  }
  if (!['aberto', 'em_atendimento'].includes(ticket.status)) {
    return { ok: false, status: 409, error: 'Este ticket não está mais ativo' }
  }

  const actorPermissoes = Array.isArray(actor?.permissoes) ? actor?.permissoes[0] : actor?.permissoes
  const isAuthorized = actor?.is_master === true
    || actorPermissoes?.can_see_all_tickets === true
    || (actor?.id && ticket.colaborador_id === actor.id)

  if (!isAuthorized) {
    return { ok: false, status: 403, error: 'Você não está autorizado a enviar mensagens para este ticket' }
  }

  return { ok: true, ticket }
}
