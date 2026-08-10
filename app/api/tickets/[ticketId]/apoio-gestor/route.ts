import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getEligibleManagersForSector,
  getLatestManagerSupport,
  getManagerSupportById,
  getManagerSupportMessages,
  getOpenManagerSupport,
  isActiveTicket,
  isSupportParticipant,
  MANAGER_SUPPORT_SELECT,
  pushManagerSupportRecipients,
  resolveManagerSupportContext,
  type ManagerSupportContextResult,
  type ManagerSupportRow,
} from '@/lib/server/manager-support'

const ticketIdSchema = z.string().uuid()
const updateSchema = z.object({
  action: z.enum(['accept', 'close']),
  apoioId: z.string().uuid(),
}).strict()

type SupportContext = Extract<ManagerSupportContextResult, { ok: true }>
type RouteContext = { params: Promise<{ ticketId: string }> }

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

function contextErrorResponse(context: Exclude<ManagerSupportContextResult, { ok: true }>) {
  return errorResponse(context.error, context.code, context.status)
}

async function parseTicketContext(routeContext: RouteContext) {
  const { ticketId } = await routeContext.params
  const parsedTicketId = ticketIdSchema.safeParse(ticketId)
  if (!parsedTicketId.success) return null
  return resolveManagerSupportContext(parsedTicketId.data)
}

function supportTicketLabel(context: SupportContext) {
  return context.ticket.number ? `ticket #${context.ticket.number}` : 'ticket selecionado'
}

function ensureActiveTicket(context: SupportContext) {
  if (!isActiveTicket(context.ticket.status)) {
    return errorResponse(
      'Este ticket não está mais ativo.',
      'TICKET_NOT_ACTIVE',
      409,
    )
  }

  if (!context.ticket.attendantId) {
    return errorResponse(
      'O ticket ainda não possui um atendente responsável.',
      'TICKET_WITHOUT_OWNER',
      409,
    )
  }

  return null
}

async function pushAttendant(
  context: SupportContext,
  support: ManagerSupportRow,
  title: string,
  message: string,
) {
  if (!context.ticket.attendantId) return null

  return pushManagerSupportRecipients({
    service: context.service,
    senderId: context.actor.id,
    recipientIds: [context.ticket.attendantId],
    title,
    message,
    url: `/workdesk?ticket=${encodeURIComponent(context.ticket.id)}&apoio=${encodeURIComponent(support.id)}`,
    tag: `apoio-gestor-${support.id}`,
  })
}

async function acceptPendingSupport(
  context: SupportContext,
  support: ManagerSupportRow,
) {
  if (!context.isEligibleManager || context.role !== 'manager') {
    return errorResponse(
      'Você não está autorizado a aceitar este chamado.',
      'MANAGER_OUT_OF_SCOPE',
      403,
    )
  }

  if (support.status === 'ativo') {
    if (support.gestor_id === context.actor.id) {
      return NextResponse.json({ success: true, support, idempotent: true })
    }
    return errorResponse(
      'Outro gestor já aceitou este chamado.',
      'SUPPORT_ALREADY_TAKEN',
      409,
    )
  }

  if (support.status !== 'pendente' || support.gestor_id) {
    return errorResponse(
      'Este chamado não está mais aguardando aceite.',
      'SUPPORT_NOT_PENDING',
      409,
    )
  }

  const { data: accepted, error } = await context.service.rpc(
    'chama_gestor_aceitar_apoio',
    {
      p_ticket_id: context.ticket.id,
      p_apoio_id: support.id,
      p_gestor_id: context.actor.id,
    },
  )

  if (error) {
    if (['23514', '40001', '40P01', '55P03'].includes(error.code ?? '')) {
      return errorResponse(
        'O ticket ou o chamado mudou durante o aceite. Atualize e tente novamente.',
        'SUPPORT_CONTEXT_CHANGED',
        409,
      )
    }
    console.error('[manager-support] Failed to accept support request:', error.message)
    return errorResponse(
      'Não foi possível aceitar o chamado.',
      'SUPPORT_OPERATION_FAILED',
      500,
    )
  }

  const selected = await getManagerSupportById(
    context.service,
    context.ticket.id,
    support.id,
  )
  if (selected.error) {
    console.error('[manager-support] Failed to reconcile support acceptance:', selected.error)
    return errorResponse(
      'Não foi possível confirmar o aceite.',
      'SUPPORT_OPERATION_FAILED',
      500,
    )
  }

  if (accepted !== true) {
    if (selected.support?.status === 'ativo' && selected.support.gestor_id === context.actor.id) {
      return NextResponse.json({ success: true, support: selected.support, idempotent: true })
    }
    if (selected.support?.status === 'ativo') {
      return errorResponse(
        'Outro gestor já aceitou este chamado.',
        'SUPPORT_ALREADY_TAKEN',
        409,
      )
    }
    return errorResponse(
      'O ticket ou o chamado mudou durante o aceite.',
      'SUPPORT_CONTEXT_CHANGED',
      409,
    )
  }

  if (selected.support?.status !== 'ativo' || selected.support.gestor_id !== context.actor.id) {
    return errorResponse(
      'Não foi possível confirmar o gestor responsável pelo apoio.',
      'SUPPORT_CONTEXT_CHANGED',
      409,
    )
  }

  const acceptedSupport = selected.support
  await pushAttendant(
    context,
    acceptedSupport,
    'Gestor aceitou o chamado',
    `${context.actor.name} aceitou o apoio do ${supportTicketLabel(context)}.`,
  )

  return NextResponse.json({ success: true, support: acceptedSupport, accepted: true })
}

async function createPendingSupport(context: SupportContext) {
  if (!context.isTicketOwner || context.role !== 'attendant') {
    return errorResponse(
      'Somente o responsável atual pode chamar um gestor.',
      'SUPPORT_FORBIDDEN',
      403,
    )
  }

  const eligible = await getEligibleManagersForSector(
    context.service,
    context.ticket.sectorId,
    [context.actor.id],
  )
  if (eligible.error) {
    console.error('[manager-support] Failed to find eligible managers:', eligible.error)
    return errorResponse(
      'Não foi possível localizar os gestores do setor.',
      'SUPPORT_OPERATION_FAILED',
      500,
    )
  }
  if (eligible.managers.length === 0) {
    return errorResponse(
      'Não há gestores habilitados para este setor.',
      'NO_ELIGIBLE_MANAGER',
      409,
    )
  }

  const { data, error } = await context.service
    .from('ticket_apoios_gestor')
    .insert({
      ticket_id: context.ticket.id,
      setor_id: context.ticket.sectorId,
      atendente_id: context.actor.id,
      atendente_nome: context.ticket.attendantName ?? context.actor.name,
      solicitante_id: context.actor.id,
      origem: 'atendente',
      status: 'pendente',
    })
    .select(MANAGER_SUPPORT_SELECT)
    .maybeSingle()

  if (error?.code === '23505') {
    const current = await getOpenManagerSupport(context.service, context.ticket.id)
    if (current.support) {
      return NextResponse.json({ success: true, support: current.support, idempotent: true })
    }
    return errorResponse(
      'Já existe um chamado em andamento neste ticket.',
      'SUPPORT_ALREADY_EXISTS',
      409,
    )
  }
  if (error || !data) {
    console.error('[manager-support] Failed to create support request:', error?.message)
    return errorResponse(
      'Não foi possível chamar um gestor.',
      'SUPPORT_OPERATION_FAILED',
      500,
    )
  }

  const support = data as unknown as ManagerSupportRow
  await pushManagerSupportRecipients({
    service: context.service,
    senderId: context.actor.id,
    recipientIds: eligible.managers.map((manager) => manager.id),
    title: 'Atendente solicitou apoio',
    message: `${context.actor.name} solicitou um gestor no ${supportTicketLabel(context)}.`,
    url: `/setor/${encodeURIComponent(context.ticket.sectorId)}?ticket=${encodeURIComponent(context.ticket.id)}&apoio=${encodeURIComponent(support.id)}`,
    tag: `apoio-gestor-${support.id}`,
  })

  return NextResponse.json({ success: true, support, created: true }, { status: 201 })
}

async function createManagerInitiatedSupport(context: SupportContext) {
  if (!context.isEligibleManager || context.role !== 'manager') {
    return errorResponse(
      'Você não está autorizado a iniciar apoio neste setor.',
      'MANAGER_OUT_OF_SCOPE',
      403,
    )
  }

  const now = new Date().toISOString()
  const { data, error } = await context.service
    .from('ticket_apoios_gestor')
    .insert({
      ticket_id: context.ticket.id,
      setor_id: context.ticket.sectorId,
      atendente_id: context.ticket.attendantId!,
      atendente_nome: context.ticket.attendantName ?? 'Atendente',
      solicitante_id: context.actor.id,
      gestor_id: context.actor.id,
      gestor_nome: context.actor.name,
      origem: 'gestor',
      status: 'ativo',
      aceito_em: now,
      atualizado_em: now,
    })
    .select(MANAGER_SUPPORT_SELECT)
    .maybeSingle()

  if (error?.code === '23505') {
    const current = await getOpenManagerSupport(context.service, context.ticket.id)
    if (current.error) {
      console.error('[manager-support] Failed to reconcile manager support start:', current.error)
      return errorResponse(
        'Não foi possível iniciar o apoio.',
        'SUPPORT_OPERATION_FAILED',
        500,
      )
    }
    if (current.support?.status === 'pendente') {
      return errorResponse(
        'Uma solicitação de apoio foi criada. Atualize antes de aceitar.',
        'SUPPORT_CONTEXT_CHANGED',
        409,
      )
    }
    if (current.support?.gestor_id === context.actor.id) {
      return NextResponse.json({ success: true, support: current.support, idempotent: true })
    }
    return errorResponse(
      'Outro gestor já está apoiando este atendimento.',
      'SUPPORT_ALREADY_TAKEN',
      409,
    )
  }
  if (error || !data) {
    console.error('[manager-support] Failed to start manager support:', error?.message)
    return errorResponse(
      'Não foi possível iniciar o apoio.',
      'SUPPORT_OPERATION_FAILED',
      500,
    )
  }

  const support = data as unknown as ManagerSupportRow
  await pushAttendant(
    context,
    support,
    'Gestor iniciou um apoio',
    `${context.actor.name} iniciou apoio no ${supportTicketLabel(context)}.`,
  )

  return NextResponse.json({ success: true, support, created: true }, { status: 201 })
}

async function closeSupport(context: SupportContext, support: ManagerSupportRow) {
  if (support.status === 'encerrado' || support.status === 'cancelado') {
    if (!isSupportParticipant(support, context)) {
      return errorResponse(
        'Somente os participantes podem encerrar este apoio.',
        'SUPPORT_FORBIDDEN',
        403,
      )
    }
    return NextResponse.json({ success: true, support, idempotent: true })
  }

  const isWaitingCancellation = support.status === 'pendente'
  const canClose = isWaitingCancellation
    ? context.isTicketOwner && support.atendente_id === context.actor.id
    : isSupportParticipant(support, context)

  if (!canClose) {
    return errorResponse(
      'Somente os participantes podem encerrar este apoio.',
      'SUPPORT_FORBIDDEN',
      403,
    )
  }

  const nextStatus = isWaitingCancellation ? 'cancelado' : 'encerrado'
  const now = new Date().toISOString()
  const { data, error } = await context.service
    .from('ticket_apoios_gestor')
    .update({
      status: nextStatus,
      motivo: isWaitingCancellation ? 'cancelado_pelo_atendente' : 'encerrado_pelo_participante',
      encerrado_em: now,
      encerrado_por_id: context.actor.id,
      atualizado_em: now,
    })
    .eq('id', support.id)
    .eq('ticket_id', context.ticket.id)
    .eq('setor_id', context.ticket.sectorId)
    .eq('status', support.status)
    .select(MANAGER_SUPPORT_SELECT)
    .maybeSingle()

  if (error) {
    console.error('[manager-support] Failed to close support:', error.message)
    return errorResponse(
      'Não foi possível encerrar o apoio.',
      'SUPPORT_OPERATION_FAILED',
      500,
    )
  }

  if (!data) {
    const selected = await getManagerSupportById(
      context.service,
      context.ticket.id,
      support.id,
    )
    if (selected.error) {
      console.error('[manager-support] Failed to reconcile support closure:', selected.error)
      return errorResponse(
        'Não foi possível confirmar o encerramento.',
        'SUPPORT_OPERATION_FAILED',
        500,
      )
    }
    if (selected.support && ['encerrado', 'cancelado'].includes(selected.support.status)) {
      return NextResponse.json({ success: true, support: selected.support, idempotent: true })
    }
    return errorResponse(
      'O estado do apoio mudou durante o encerramento.',
      'SUPPORT_CONTEXT_CHANGED',
      409,
    )
  }

  return NextResponse.json({
    success: true,
    support: data as unknown as ManagerSupportRow,
  })
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestedSupportId = new URL(request.url).searchParams.get('apoioId')
  if (requestedSupportId !== null && !ticketIdSchema.safeParse(requestedSupportId).success) {
    return errorResponse('Apoio inválido.', 'INVALID_SUPPORT_REQUEST', 400)
  }

  const context = await parseTicketContext(routeContext)
  if (!context) return errorResponse('Ticket inválido.', 'INVALID_SUPPORT_REQUEST', 400)
  if (!context.ok) return contextErrorResponse(context)

  if (!context.canParticipate) {
    return NextResponse.json({
      role: context.role,
      canParticipate: false,
      support: null,
      messages: [],
    })
  }

  const selected = requestedSupportId !== null
    ? await getManagerSupportById(context.service, context.ticket.id, requestedSupportId)
    : await getLatestManagerSupport(context.service, context.ticket.id)
  if (selected.error) {
    console.error('[manager-support] Failed to load support:', selected.error)
    return errorResponse(
      'Não foi possível carregar o apoio.',
      'SUPPORT_OPERATION_FAILED',
      500,
    )
  }
  if (requestedSupportId !== null && !selected.support) {
    return errorResponse(
      'Esta sessão de apoio não foi encontrada.',
      'SUPPORT_NOT_FOUND',
      404,
    )
  }

  let messages: unknown[] = []
  const canParticipate = selected.support?.status === 'ativo'
    ? isSupportParticipant(selected.support, context)
    : context.canParticipate

  if (selected.support && isSupportParticipant(selected.support, context)) {
    const result = await getManagerSupportMessages(context.service, selected.support.id)
    if (result.error) {
      console.error('[manager-support] Failed to load support messages:', result.error)
      return errorResponse(
        'Não foi possível carregar as mensagens de apoio.',
        'SUPPORT_OPERATION_FAILED',
        500,
      )
    }
    messages = result.messages
  }

  return NextResponse.json({
    role: context.role,
    canParticipate,
    support: selected.support,
    messages,
  })
}

export async function POST(_request: Request, routeContext: RouteContext) {
  const context = await parseTicketContext(routeContext)
  if (!context) return errorResponse('Ticket inválido.', 'INVALID_SUPPORT_REQUEST', 400)
  if (!context.ok) return contextErrorResponse(context)
  if (!context.canParticipate) {
    return errorResponse(
      'Você não pode participar deste ticket.',
      'SUPPORT_FORBIDDEN',
      403,
    )
  }

  const ticketStateError = ensureActiveTicket(context)
  if (ticketStateError) return ticketStateError

  const current = await getOpenManagerSupport(context.service, context.ticket.id)
  if (current.error) {
    console.error('[manager-support] Failed to load current support:', current.error)
    return errorResponse(
      'Não foi possível consultar o apoio atual.',
      'SUPPORT_OPERATION_FAILED',
      500,
    )
  }

  if (current.support) {
    if (context.role === 'attendant') {
      return NextResponse.json({ success: true, support: current.support, idempotent: true })
    }
    if (current.support.status === 'ativo' && current.support.gestor_id === context.actor.id) {
      return NextResponse.json({ success: true, support: current.support, idempotent: true })
    }
    if (current.support.status === 'ativo') {
      return errorResponse(
        'Outro gestor já está apoiando este atendimento.',
        'SUPPORT_ALREADY_TAKEN',
        409,
      )
    }
    return errorResponse(
      'Uma solicitação de apoio foi criada. Atualize antes de aceitar.',
      'SUPPORT_CONTEXT_CHANGED',
      409,
    )
  }

  return context.role === 'attendant'
    ? createPendingSupport(context)
    : createManagerInitiatedSupport(context)
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const parsedBody = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) {
    return errorResponse('Ação inválida.', 'INVALID_SUPPORT_REQUEST', 400)
  }

  const context = await parseTicketContext(routeContext)
  if (!context) return errorResponse('Ticket inválido.', 'INVALID_SUPPORT_REQUEST', 400)
  if (!context.ok) return contextErrorResponse(context)
  if (!context.canParticipate) {
    return errorResponse(
      'Você não pode participar deste ticket.',
      'SUPPORT_FORBIDDEN',
      403,
    )
  }

  const ticketStateError = ensureActiveTicket(context)
  if (ticketStateError) return ticketStateError

  const selected = await getManagerSupportById(
    context.service,
    context.ticket.id,
    parsedBody.data.apoioId,
  )
  if (selected.error) {
    console.error('[manager-support] Failed to load selected support before update:', selected.error)
    return errorResponse(
      'Não foi possível consultar o apoio atual.',
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

  return parsedBody.data.action === 'accept'
    ? acceptPendingSupport(context, selected.support)
    : closeSupport(context, selected.support)
}
