/**
 * Status de ticket que aceitam envio de mensagem.
 *
 * Exportado para a tela poder travar o compositor com a MESMA regra do
 * servidor. Enquanto a tela não conhecia esta lista, o atendente digitava a
 * resposta num ticket que já tinha saído de ativo (tipicamente para 'avaliar'),
 * clicava em enviar e só então recebia a recusa — com o texto perdido.
 */
export const STATUS_QUE_ACEITAM_ENVIO = ['aberto', 'em_atendimento'] as const

export interface TicketSendAuthOk {
  ok: true
  actor: { id: string; isMaster: boolean }
  ticket: { id: string; status: string; colaborador_id: string | null; setor_id: string }
}
export interface TicketSendAuthFail {
  ok: false
  status: number
  code: string
  error: string
}
export type TicketSendAuthResult = TicketSendAuthOk | TicketSendAuthFail

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function authorizeTicketSend(
  supabase: Pick<SupabaseClient, 'from'>,
  ticketId: string,
  userEmail: string,
): Promise<TicketSendAuthResult> {
  const [{ data: ticket, error: ticketError }, { data: actor, error: actorError }] = await Promise.all([
    supabase.from('tickets').select('id, status, colaborador_id, setor_id').eq('id', ticketId).maybeSingle(),
    supabase
      .from('colaboradores')
      .select('id, ativo, is_master, setor_id, permissoes:permissao_id(can_see_all_tickets)')
      .eq('email', userEmail)
      .maybeSingle(),
  ])

  if (ticketError || actorError) {
    return {
      ok: false,
      status: 500,
      code: 'SEND_AUTH_CHECK_FAILED',
      error: 'Erro ao validar autorização de envio',
    }
  }
  if (!actor?.ativo) {
    return {
      ok: false,
      status: 403,
      code: 'COLLABORATOR_INACTIVE',
      error: 'Colaborador não autorizado',
    }
  }
  if (!ticket) {
    return {
      ok: false,
      status: 404,
      code: 'TICKET_NOT_FOUND',
      error: 'Ticket não encontrado',
    }
  }
  if (!(STATUS_QUE_ACEITAM_ENVIO as readonly string[]).includes(ticket.status)) {
    return {
      ok: false,
      status: 409,
      code: 'TICKET_NOT_ACTIVE',
      error: 'Este ticket não está mais ativo',
    }
  }

  if (actor.is_master === true || ticket.colaborador_id === actor.id) {
    return {
      ok: true,
      actor: { id: actor.id, isMaster: actor.is_master === true },
      ticket,
    }
  }

  const permissions = firstRelation(actor.permissoes)
  if (permissions?.can_see_all_tickets !== true) {
    return {
      ok: false,
      status: 403,
      code: 'TICKET_SEND_FORBIDDEN',
      error: 'Você não está autorizado a enviar mensagens para este ticket',
    }
  }

  const linkedSectorIds = actor.setor_id ? [actor.setor_id] : []
  const { data: sectorLinks, error: sectorLinksError } = await supabase
    .from('colaboradores_setores')
    .select('setor_id')
    .eq('colaborador_id', actor.id)

  if (sectorLinksError) {
    return {
      ok: false,
      status: 500,
      code: 'SEND_AUTH_CHECK_FAILED',
      error: 'Erro ao validar os setores do colaborador',
    }
  }

  linkedSectorIds.push(
    ...(sectorLinks || [])
      .map((link: { setor_id?: string | null }) => link.setor_id)
      .filter((sectorId: string | null | undefined): sectorId is string => Boolean(sectorId)),
  )

  if (!linkedSectorIds.includes(ticket.setor_id)) {
    return {
      ok: false,
      status: 403,
      code: 'SUPERVISOR_OUT_OF_SCOPE',
      error: 'Você não está autorizado a enviar mensagens neste setor',
    }
  }

  return {
    ok: true,
    actor: { id: actor.id, isMaster: false },
    ticket,
  }
}
import type { SupabaseClient } from '@supabase/supabase-js'
