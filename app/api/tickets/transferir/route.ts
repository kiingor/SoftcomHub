import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isExactSubsetorMatch, shouldRouteTransferToSupport } from '@/lib/subsetor-routing'
import { findActiveSupportSubsetor } from '@/lib/support-subsetor'
import { processTicketQueue } from '@/lib/ticket-queue-processor'

const transferRequestSchema = z.object({
  ticket_id: z.string().uuid('ticket_id inválido'),
  setor_id: z.string().uuid('setor_id inválido').optional(),
  subsetor_id: z.string().uuid('subsetor_id inválido').nullable().optional(),
  colaborador_id: z.string().uuid('colaborador_id inválido').nullable().optional(),
  from_colaborador_nome: z.string().max(200).optional(),
  from_setor_nome: z.string().max(200).optional(),
})

const RPC_FAILURES: Record<string, { error: string; status: number }> = {
  TICKET_NOT_FOUND: { error: 'Ticket não encontrado', status: 404 },
  ACTOR_NOT_AUTHORIZED: { error: 'Colaborador não autorizado', status: 403 },
  TICKET_FORBIDDEN: { error: 'Você não pode transferir este ticket', status: 403 },
  TICKET_INACTIVE: { error: 'Somente tickets ativos podem ser transferidos', status: 409 },
  TARGET_SECTOR_NOT_FOUND: { error: 'Setor de destino não encontrado', status: 422 },
  TRANSFER_NOT_ALLOWED: {
    error: 'O setor de destino não está habilitado para transferências a partir do setor atual.',
    status: 422,
  },
  INVALID_SUBSETOR: {
    error: 'Subsetor não encontrado, inativo ou não pertence ao setor de destino.',
    status: 422,
  },
  INVALID_COLLABORATOR: { error: 'Atendente não encontrado ou inativo.', status: 422 },
  COLLABORATOR_NOT_LINKED: {
    error: 'O atendente não está vinculado ao setor de destino.',
    status: 422,
  },
  COLLABORATOR_SUBSETOR_MISMATCH: {
    error: 'O atendente selecionado não é compatível com este subsetor.',
    status: 422,
  },
  COLLABORATOR_ONLINE_PAUSED: {
    error: 'Este atendente está em pausa. Selecione outro atendente.',
    status: 422,
  },
}

interface AtomicTransferResult {
  success: boolean
  code?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getSetorName(relation: unknown): string | null {
  const setor = Array.isArray(relation) ? relation[0] : relation
  return isRecord(setor) && typeof setor.nome === 'string' ? setor.nome : null
}

function parseAtomicTransferResult(value: unknown): AtomicTransferResult | null {
  if (!isRecord(value) || typeof value.success !== 'boolean') return null

  return {
    success: value.success,
    code: typeof value.code === 'string' ? value.code : undefined,
  }
}

/**
 * POST /api/tickets/transferir
 *
 * Transfers an active ticket to a compatible queue or attendant. The final
 * ticket state is committed by one database transaction.
 */
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const rawBody: unknown = await request.json().catch(() => null)
    const parsedBody = transferRequestSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message ?? 'Corpo da requisição inválido' },
        { status: 400 },
      )
    }

    const body = parsedBody.data
    const rawBodyRecord = isRecord(rawBody) ? rawBody : {}
    const hasExplicitSetor = Object.prototype.hasOwnProperty.call(rawBodyRecord, 'setor_id')
    const hasExplicitSubsetor = Object.prototype.hasOwnProperty.call(rawBodyRecord, 'subsetor_id')
    const supabase = createServiceClient()

    const { data: actor, error: actorError } = await supabase
      .from('colaboradores')
      .select('id, nome, ativo, is_master')
      .eq('email', user.email)
      .maybeSingle()

    if (actorError) {
      console.error('[Transferir] Erro ao buscar colaborador:', actorError)
      return NextResponse.json({ error: 'Erro ao validar colaborador' }, { status: 500 })
    }
    if (!actor?.ativo) {
      return NextResponse.json({ error: 'Colaborador não autorizado' }, { status: 403 })
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select(
        'id, setor_id, subsetor_id, colaborador_id, cliente_id, status, setores!tickets_setor_id_fkey(nome)',
      )
      .eq('id', body.ticket_id)
      .maybeSingle()

    if (ticketError) {
      console.error('[Transferir] Erro ao buscar ticket:', ticketError)
      return NextResponse.json({ error: 'Erro ao buscar ticket' }, { status: 500 })
    }
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
    }
    if (ticket.colaborador_id !== actor.id && actor.is_master !== true) {
      return NextResponse.json({ error: 'Você não pode transferir este ticket' }, { status: 403 })
    }
    if (!['aberto', 'em_atendimento'].includes(ticket.status)) {
      return NextResponse.json(
        { error: 'Somente tickets ativos podem ser transferidos' },
        { status: 409 },
      )
    }

    const targetSetorId = hasExplicitSetor ? body.setor_id! : ticket.setor_id
    const isChangingSetor = targetSetorId !== ticket.setor_id
    let targetSubsetorId = !isChangingSetor && !hasExplicitSubsetor
      ? ticket.subsetor_id
      : body.subsetor_id ?? null

    const { data: targetSetor, error: targetSetorError } = await supabase
      .from('setores')
      .select('id, nome')
      .eq('id', targetSetorId)
      .maybeSingle()

    if (targetSetorError) {
      console.error('[Transferir] Erro ao buscar setor de destino:', targetSetorError)
      return NextResponse.json({ error: 'Erro ao validar setor de destino' }, { status: 500 })
    }
    if (!targetSetor) {
      return NextResponse.json({ error: 'Setor de destino não encontrado' }, { status: 422 })
    }

    if (targetSetorId !== ticket.setor_id) {
      const { data: allowedDestination, error: allowlistError } = await supabase
        .from('setor_destinos_transferencia')
        .select('setor_destino_id')
        .eq('setor_origem_id', ticket.setor_id)
        .eq('setor_destino_id', targetSetorId)
        .maybeSingle()

      if (allowlistError) {
        console.error('[Transferir] Erro ao validar destino permitido:', allowlistError)
        return NextResponse.json(
          { error: 'Erro ao validar o setor de destino' },
          { status: 500 },
        )
      }
      if (!allowedDestination) {
        return NextResponse.json(
          { error: RPC_FAILURES.TRANSFER_NOT_ALLOWED.error },
          { status: 422 },
        )
      }
    }

    let targetSubsetor: { id: string; nome: string } | null = null
    const shouldUseSupportQueue = shouldRouteTransferToSupport({
      destinationSetorId: isChangingSetor ? targetSetorId : null,
      destinationSubsetorId: targetSubsetorId,
      destinationColaboradorId: body.colaborador_id ?? null,
      currentSubsetorId: !isChangingSetor && !hasExplicitSubsetor
        ? ticket.subsetor_id
        : null,
    })

    if (shouldUseSupportQueue) {
      try {
        targetSubsetor = await findActiveSupportSubsetor(supabase, targetSetorId)
      } catch (error) {
        console.error('[Transferir] Erro ao buscar subsetor Suporte:', error)
        return NextResponse.json(
          { error: 'Não foi possível localizar a fila de Suporte.' },
          { status: 500 },
        )
      }

      if (!targetSubsetor) {
        return NextResponse.json(
          { error: 'O setor de destino não possui um subsetor Suporte ativo.' },
          { status: 422 },
        )
      }
      targetSubsetorId = targetSubsetor.id
    } else if (targetSubsetorId) {
      const { data: subsetor, error: subsetorError } = await supabase
        .from('subsetores')
        .select('id, nome, setor_id, ativo')
        .eq('id', targetSubsetorId)
        .maybeSingle()

      if (subsetorError) {
        console.error('[Transferir] Erro ao validar subsetor:', subsetorError)
        return NextResponse.json({ error: 'Erro ao validar subsetor' }, { status: 500 })
      }
      if (!subsetor || !subsetor.ativo || subsetor.setor_id !== targetSetorId) {
        return NextResponse.json({ error: RPC_FAILURES.INVALID_SUBSETOR.error }, { status: 422 })
      }
      targetSubsetor = { id: subsetor.id, nome: subsetor.nome }
    }

    let targetColaborador: { id: string; nome: string } | null = null
    if (body.colaborador_id) {
      const [colaboradorResult, setorLinkResult, subsetorLinksResult] = await Promise.all([
        supabase
          .from('colaboradores')
          .select('id, nome, is_online, ativo, pausa_atual_id')
          .eq('id', body.colaborador_id)
          .maybeSingle(),
        supabase
          .from('colaboradores_setores')
          .select('colaborador_id')
          .eq('colaborador_id', body.colaborador_id)
          .eq('setor_id', targetSetorId)
          .maybeSingle(),
        supabase
          .from('colaboradores_subsetores')
          .select('subsetor_id')
          .eq('colaborador_id', body.colaborador_id)
          .eq('setor_id', targetSetorId),
      ])

      if (colaboradorResult.error || setorLinkResult.error || subsetorLinksResult.error) {
        console.error('[Transferir] Erro ao validar atendente:', {
          colaborador: colaboradorResult.error,
          setor: setorLinkResult.error,
          subsetor: subsetorLinksResult.error,
        })
        return NextResponse.json({ error: 'Erro ao validar atendente' }, { status: 500 })
      }

      const colaborador = colaboradorResult.data
      if (!colaborador?.ativo) {
        return NextResponse.json(
          { error: RPC_FAILURES.INVALID_COLLABORATOR.error },
          { status: 422 },
        )
      }
      if (!setorLinkResult.data) {
        return NextResponse.json(
          { error: RPC_FAILURES.COLLABORATOR_NOT_LINKED.error },
          { status: 422 },
        )
      }

      const subsetorIds = (subsetorLinksResult.data ?? [])
        .map((link: unknown) => (
          isRecord(link) && typeof link.subsetor_id === 'string' ? link.subsetor_id : null
        ))
        .filter((subsetorId): subsetorId is string => subsetorId !== null)

      if (!isExactSubsetorMatch(targetSubsetorId, subsetorIds)) {
        return NextResponse.json(
          { error: RPC_FAILURES.COLLABORATOR_SUBSETOR_MISMATCH.error },
          { status: 422 },
        )
      }
      if (colaborador.is_online === true && colaborador.pausa_atual_id) {
        return NextResponse.json(
          { error: RPC_FAILURES.COLLABORATOR_ONLINE_PAUSED.error },
          { status: 422 },
        )
      }

      targetColaborador = { id: colaborador.id, nome: colaborador.nome }
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('transfer_ticket_atomic', {
      p_ticket_id: body.ticket_id,
      p_actor_id: actor.id,
      p_setor_id: targetSetorId,
      p_subsetor_id: targetSubsetorId,
      p_colaborador_id: targetColaborador?.id ?? null,
    })

    if (rpcError) {
      console.error('[Transferir] RPC transfer_ticket_atomic falhou:', rpcError)
      return NextResponse.json({ error: 'Erro ao transferir ticket' }, { status: 500 })
    }

    const rpcResult = parseAtomicTransferResult(rpcData)
    if (!rpcResult) {
      console.error('[Transferir] Resposta inválida da RPC transfer_ticket_atomic:', rpcData)
      return NextResponse.json({ error: 'Erro ao transferir ticket' }, { status: 500 })
    }
    if (!rpcResult.success) {
      const failure = rpcResult.code ? RPC_FAILURES[rpcResult.code] : undefined
      return NextResponse.json(
        { error: failure?.error ?? 'O ticket foi alterado por outro processo' },
        { status: failure?.status ?? 409 },
      )
    }

    const queued = targetColaborador === null
    const fromNome = actor.nome || 'Desconhecido'
    const fromSetor = getSetorName(ticket.setores) || 'Desconhecido'
    const destinoNome = targetSubsetor
      ? `${targetSetor.nome} / ${targetSubsetor.nome}`
      : targetSetor.nome
    const toColaboradorNome = targetColaborador?.nome
      ?? (targetSubsetor ? `Fila do subsetor ${targetSubsetor.nome}` : 'Fila de espera')
    const conteudo = `Transferido de ${fromNome} - ${fromSetor} >> ${toColaboradorNome} - ${destinoNome}`

    const { error: messageError } = await supabase.from('mensagens').insert({
      ticket_id: body.ticket_id,
      cliente_id: ticket.cliente_id,
      remetente: 'sistema',
      conteudo,
      tipo: 'texto',
      enviado_em: new Date().toISOString(),
    })
    if (messageError) {
      console.warn('[Transferir] Falha ao gravar mensagem de transferência:', messageError.message)
    }

    const destinationLogSuffix = targetColaborador
      ? ` (para ${targetColaborador.nome})`
      : ' (fila)'
    const { error: logError } = await supabase.from('ticket_logs').insert({
      ticket_id: body.ticket_id,
      tipo: 'transferencia',
      descricao: `Transferido por ${fromNome}: ${fromSetor} → ${destinoNome}${destinationLogSuffix}`,
    })
    if (logError) {
      console.warn('[Transferir] Falha ao gravar log de transferência:', logError.message)
    }

    if (queued) {
      processTicketQueue().catch((error: unknown) => {
        console.error('[Transferir] Erro ao processar fila após transferência:', error)
      })
    }

    const message = targetColaborador
      ? `Ticket transferido para ${targetColaborador.nome}`
      : targetSubsetor
        ? `Ticket transferido para a fila do subsetor ${targetSubsetor.nome}`
        : 'Ticket transferido para a fila do setor'

    return NextResponse.json({
      success: true,
      queued,
      message,
      colaborador_id: targetColaborador?.id ?? null,
      setor_id: targetSetorId,
      subsetor_id: targetSubsetorId,
      subsetor_nome: targetSubsetor?.nome ?? null,
    })
  } catch (error) {
    console.error('[Transferir] Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
