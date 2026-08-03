import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isExactSubsetorMatch } from '@/lib/subsetor-routing'
import { processTicketQueue } from '@/lib/ticket-queue-processor'
import { marcarSaidaDaFila } from '@/lib/ticket-assignment-stamp'
import { canTransferTicket, isTransferTargetAvailable } from '@/lib/transfer-authorization'

const transferRequestSchema = z.object({
  ticket_id: z.string().uuid('ticket_id inválido'),
  setor_id: z.string().uuid('setor_id inválido').optional(),
  subsetor_id: z.string().uuid('subsetor_id inválido').nullable().optional(),
  colaborador_id: z.string().uuid('colaborador_id inválido').nullable().optional(),
  from_colaborador_nome: z.string().max(200).optional(),
  from_setor_nome: z.string().max(200).optional(),
  observacao: z.string().trim().max(1000).optional(),
  // Confirma que o atendente de destino está indisponível (offline/pausa) e mesmo
  // assim deve receber o ticket — setado pelo client só depois de confirmação do usuário.
  allow_unavailable: z.boolean().optional(),
})

const TRANSFER_ERRORS = {
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getSetorName(relation: unknown): string | null {
  const setor = Array.isArray(relation) ? relation[0] : relation
  return isRecord(setor) && typeof setor.nome === 'string' ? setor.nome : null
}

/**
 * POST /api/tickets/transferir
 *
 * Transfers an active ticket to a compatible queue or attendant. The final
 * ticket state is committed by one conditional database update.
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
      .select('id, nome, ativo, is_master, setor_id, permissoes:permissao_id(can_see_all_tickets)')
      .eq('email', user.email)
      .maybeSingle()

    if (actorError) {
      console.error('[Transferir] Erro ao buscar colaborador:', actorError)
      return NextResponse.json({ error: 'Erro ao validar colaborador' }, { status: 500 })
    }
    if (!actor?.ativo) {
      return NextResponse.json({ error: 'Colaborador não autorizado' }, { status: 403 })
    }
    const actorPermissoes = Array.isArray(actor.permissoes) ? actor.permissoes[0] : actor.permissoes
    const actorCanSeeAllTickets = actorPermissoes?.can_see_all_tickets === true

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
    // Setores vinculados ao actor (além do legado colaboradores.setor_id) — só precisa
    // buscar quando o actor não é dono do ticket nem master (evita uma query à toa).
    let actorLinkedSetorIds: string[] = actor.setor_id ? [actor.setor_id] : []
    if (ticket.colaborador_id !== actor.id && actor.is_master !== true && actorCanSeeAllTickets) {
      const { data: actorSetorLinks, error: actorSetorLinksError } = await supabase
        .from('colaboradores_setores')
        .select('setor_id')
        .eq('colaborador_id', actor.id)

      if (actorSetorLinksError) {
        console.error('[Transferir] Erro ao validar setores do colaborador:', actorSetorLinksError)
        return NextResponse.json(
          { error: 'Erro ao validar os setores do colaborador' },
          { status: 500 },
        )
      }

      actorLinkedSetorIds = Array.from(new Set([
        ...actorLinkedSetorIds,
        ...(actorSetorLinks || []).map((link: { setor_id: string }) => link.setor_id),
      ]))
    }

    const transferAuth = canTransferTicket(
      { id: actor.id, isMaster: actor.is_master === true, canSeeAllTickets: actorCanSeeAllTickets, linkedSetorIds: actorLinkedSetorIds },
      { colaboradorId: ticket.colaborador_id, setorId: ticket.setor_id },
    )
    if (!transferAuth.allowed) {
      const message = transferAuth.reason === 'SUPERVISOR_OUT_OF_SCOPE'
        ? 'Você não pode transferir tickets de um setor ao qual não está vinculado'
        : 'Você não pode transferir este ticket'
      return NextResponse.json({ error: message }, { status: 403 })
    }
    if (!['aberto', 'em_atendimento'].includes(ticket.status)) {
      return NextResponse.json(
        { error: 'Somente tickets ativos podem ser transferidos' },
        { status: 409 },
      )
    }

    const targetSetorId = hasExplicitSetor ? body.setor_id! : ticket.setor_id
    const isChangingSetor = targetSetorId !== ticket.setor_id
    const targetSubsetorId = !isChangingSetor && !hasExplicitSubsetor
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
          { error: TRANSFER_ERRORS.TRANSFER_NOT_ALLOWED.error },
          { status: 422 },
        )
      }
    }

    let targetSubsetor: { id: string; nome: string } | null = null
    if (targetSubsetorId) {
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
        return NextResponse.json({ error: TRANSFER_ERRORS.INVALID_SUBSETOR.error }, { status: 422 })
      }
      targetSubsetor = { id: subsetor.id, nome: subsetor.nome }
    }

    let targetColaborador: { id: string; nome: string } | null = null
    let wasTargetForcedUnavailable = false
    if (body.colaborador_id) {
      const [colaboradorResult, setorLinkResult, subsetorLinksResult] = await Promise.all([
        supabase
          .from('colaboradores')
          .select('id, nome, is_online, ativo, pausa_atual_id, last_heartbeat')
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
          { error: TRANSFER_ERRORS.INVALID_COLLABORATOR.error },
          { status: 422 },
        )
      }
      if (!setorLinkResult.data) {
        return NextResponse.json(
          { error: TRANSFER_ERRORS.COLLABORATOR_NOT_LINKED.error },
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
          { error: TRANSFER_ERRORS.COLLABORATOR_SUBSETOR_MISMATCH.error },
          { status: 422 },
        )
      }

      // Disponibilidade revalidada agora, no servidor — o client já mostrou uma
      // confirmação, mas o estado pode ter mudado entre a abertura do modal e o envio.
      const colaboradorDisponivel = isTransferTargetAvailable(colaborador)
      if (!colaboradorDisponivel && body.allow_unavailable !== true) {
        return NextResponse.json(
          {
            error: colaborador.pausa_atual_id
              ? 'Este atendente está em pausa.'
              : 'Este atendente está offline.',
            code: 'TARGET_UNAVAILABLE',
            pausa: Boolean(colaborador.pausa_atual_id),
          },
          { status: 409 },
        )
      }
      wasTargetForcedUnavailable = !colaboradorDisponivel

      targetColaborador = { id: colaborador.id, nome: colaborador.nome }
    }

    let updateQuery = supabase
      .from('tickets')
      .update({
        setor_id: targetSetorId,
        subsetor_id: targetSubsetorId,
        colaborador_id: targetColaborador?.id ?? null,
        status: targetColaborador ? 'em_atendimento' : 'aberto',
      })
      .eq('id', ticket.id)
      .eq('setor_id', ticket.setor_id)
      .eq('status', ticket.status)

    updateQuery = ticket.subsetor_id == null
      ? updateQuery.is('subsetor_id', null)
      : updateQuery.eq('subsetor_id', ticket.subsetor_id)
    updateQuery = ticket.colaborador_id == null
      ? updateQuery.is('colaborador_id', null)
      : updateQuery.eq('colaborador_id', ticket.colaborador_id)

    const { data: updatedTicket, error: updateError } = await updateQuery
      .select('id')
      .maybeSingle()

    if (updateError) {
      console.error('[Transferir] Erro ao atualizar ticket:', updateError)
      return NextResponse.json({ error: 'Erro ao transferir ticket' }, { status: 500 })
    }
    if (!updatedTicket) {
      return NextResponse.json(
        { error: 'O ticket foi alterado por outro processo' },
        { status: 409 },
      )
    }

    if (targetColaborador) {
      // Transferir direto para um atendente também tira o cliente da fila. O
      // helper só grava quando ainda está vazio, então transferência de ticket
      // já atribuído não reescreve a espera original.
      await marcarSaidaDaFila(supabase, ticket.id)

      const { error: receivedAtError } = await supabase
        .from('colaboradores')
        .update({ last_ticket_received_at: new Date().toISOString() })
        .eq('id', targetColaborador.id)
      if (receivedAtError) {
        console.warn('[Transferir] Falha ao atualizar ordem de distribuição:', receivedAtError.message)
      }
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
      ? ` (para ${targetColaborador.nome}${wasTargetForcedUnavailable ? ' — indisponível no momento, transferido mesmo assim' : ''})`
      : ' (fila)'
    const observationLogSuffix = body.observacao
      ? `. Obs: ${body.observacao}`
      : ''
    const { error: logError } = await supabase.from('ticket_logs').insert({
      ticket_id: body.ticket_id,
      tipo: 'transferencia',
      descricao: `Transferido por ${fromNome}: ${fromSetor} → ${destinoNome}${destinationLogSuffix}${observationLogSuffix}`,
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
