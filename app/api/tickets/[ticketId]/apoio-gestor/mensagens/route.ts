import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getManagerSupportById,
  isActiveTicket,
  isSupportParticipant,
  MANAGER_SUPPORT_MESSAGE_SELECT,
  notifyManagerSupportRecipients,
  resolveManagerSupportContext,
} from '@/lib/server/manager-support'

const ticketIdSchema = z.string().uuid()
const messageSchema = z.object({
  apoioId: z.string().uuid(),
  conteudo: z.string().trim().min(1).max(5_000),
}).strict()

type RouteContext = { params: Promise<{ ticketId: string }> }

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

export async function POST(request: Request, routeContext: RouteContext) {
  const { ticketId } = await routeContext.params
  const parsedTicketId = ticketIdSchema.safeParse(ticketId)
  if (!parsedTicketId.success) {
    return errorResponse('Ticket inválido.', 'INVALID_SUPPORT_REQUEST', 400)
  }

  const parsedBody = messageSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) {
    return errorResponse(
      'A mensagem deve possuir entre 1 e 5.000 caracteres.',
      'INVALID_SUPPORT_MESSAGE',
      422,
    )
  }

  const context = await resolveManagerSupportContext(parsedTicketId.data)
  if (!context.ok) {
    return errorResponse(context.error, context.code, context.status)
  }
  if (!context.canParticipate) {
    return errorResponse(
      'Você não pode participar deste ticket.',
      'SUPPORT_FORBIDDEN',
      403,
    )
  }
  if (!isActiveTicket(context.ticket.status) || !context.ticket.attendantId) {
    return errorResponse(
      'O contexto do ticket mudou e este apoio não pode receber mensagens.',
      'SUPPORT_CONTEXT_CHANGED',
      409,
    )
  }

  const selected = await getManagerSupportById(
    context.service,
    context.ticket.id,
    parsedBody.data.apoioId,
  )
  if (selected.error) {
    console.error('[manager-support] Failed to load selected support before sending a message:', selected.error)
    return errorResponse(
      'Não foi possível validar o apoio.',
      'SUPPORT_OPERATION_FAILED',
      500,
    )
  }
  if (!selected.support) {
    return errorResponse(
      'Esta sessão de apoio não foi encontrada.',
      'SUPPORT_NOT_FOUND',
      404,
    )
  }
  if (selected.support.status !== 'ativo') {
    return errorResponse(
      'O chat de apoio ainda não está ativo.',
      'SUPPORT_NOT_ACTIVE',
      409,
    )
  }
  if (!isSupportParticipant(selected.support, context)) {
    return errorResponse(
      'Somente os participantes podem enviar mensagens neste apoio.',
      'SUPPORT_FORBIDDEN',
      403,
    )
  }

  const { data: message, error } = await context.service
    .from('ticket_apoio_mensagens')
    .insert({
      apoio_id: selected.support.id,
      autor_id: context.actor.id,
      autor_nome: context.actor.name,
      conteudo: parsedBody.data.conteudo,
    })
    .select(MANAGER_SUPPORT_MESSAGE_SELECT)
    .maybeSingle()

  if (error || !message) {
    console.error('[manager-support] Failed to persist support message:', error?.message)
    return errorResponse(
      'Não foi possível enviar a mensagem de apoio.',
      'SUPPORT_OPERATION_FAILED',
      500,
    )
  }

  const recipientId = context.actor.id === selected.support.atendente_id
    ? selected.support.gestor_id
    : selected.support.atendente_id
  if (recipientId) {
    const recipientIsManager = recipientId === selected.support.gestor_id
    await notifyManagerSupportRecipients({
      service: context.service,
      senderId: context.actor.id,
      recipientIds: [recipientId],
      sectorId: context.ticket.sectorId,
      title: 'Nova mensagem no apoio interno',
      message: `${context.actor.name} enviou uma mensagem no apoio do ticket #${context.ticket.number ?? context.ticket.id}.`,
      url: recipientIsManager
        ? `/setor/${encodeURIComponent(context.ticket.sectorId)}?ticket=${encodeURIComponent(context.ticket.id)}&apoio=${encodeURIComponent(selected.support.id)}`
        : `/workdesk?ticket=${encodeURIComponent(context.ticket.id)}&apoio=${encodeURIComponent(selected.support.id)}`,
      tag: `apoio-gestor-mensagem-${selected.support.id}`,
    })
  }

  return NextResponse.json({ success: true, message }, { status: 201 })
}
