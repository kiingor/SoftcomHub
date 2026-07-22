import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import {
  criarEDistribuirTicket,
  TicketIdempotencyConflictError,
} from '@/lib/ticket-distribution'
import {
  findActiveNexusTicketIdForClientChannel,
  linkPreparedNexusSessionToTicket,
  loadNexusClientScope,
  logNexusSectorTransfer,
  NexusSessionLinkValidationError,
  prepareLatestNexusSessionLink,
  prepareNexusSessionLink,
  prepareRecentNexusSessionLink,
  type PreparedNexusSession,
} from '@/lib/server/nexus-message-linking'
import { createNexusSessionTicketId } from '@/lib/server/nexus-ticket-id'

type ServiceClient = ReturnType<typeof createServiceClient>
const NO_MATCH_TICKET_ID = '00000000-0000-0000-0000-000000000000'

async function prepareRecentNexusHistory({
  supabase,
  clientIds,
  clientPhone,
  sourceChannelId,
}: {
  supabase: ServiceClient
  clientIds: readonly string[]
  clientPhone: string | null
  sourceChannelId: string | null
}): Promise<PreparedNexusSession | null> {
  if (!sourceChannelId) return null

  return prepareRecentNexusSessionLink({
    supabase,
    sourceChannelId,
    allowedClientIds: clientIds,
    clientPhone,
  })
}

async function refreshPreparedNexusSession({
  supabase,
  preparedSession,
  ticketId,
  clientIds,
  clientPhone,
}: {
  supabase: ServiceClient
  preparedSession: PreparedNexusSession
  ticketId: string
  clientIds: readonly string[]
  clientPhone: string | null
}) {
  if (preparedSession.messageIds.length === 0) return preparedSession

  return prepareNexusSessionLink({
    supabase,
    messageIds: preparedSession.messageIds,
    sourceSectorId: preparedSession.sourceSectorId,
    allowedClientIds: clientIds,
    clientPhone,
    targetTicketId: ticketId,
  })
}

/**
 * API to create a new ticket with optional subsetor routing
 * This is typically called by external systems (chatbots, flows) 
 * that have already determined the appropriate setor and subsetor
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Use service role to bypass RLS — this endpoint is called by bots/n8n without user session
    const supabase = createServiceClient()

    const { 
      cliente_id, 
      telefone, 
      nome_cliente,
      setor_id, 
      subsetor_id,
      canal = 'whatsapp',
      phone_number_id,
      tipo_atendimento,
    } = body
    const sourceChannelId = typeof phone_number_id === 'string'
      ? phone_number_id.trim() || null
      : null
    const tipoAtendimento = typeof tipo_atendimento === 'string'
      ? tipo_atendimento.trim().slice(0, 200) || null
      : null

    // Validate required fields
    if (!setor_id) {
      return NextResponse.json({ error: 'setor_id é obrigatório' }, { status: 400 })
    }

    if (!cliente_id && !telefone) {
      return NextResponse.json({ error: 'cliente_id ou telefone é obrigatório' }, { status: 400 })
    }

    let finalClienteId = cliente_id

    // If cliente_id not provided, find or create by telefone
    if (!finalClienteId && telefone) {
      const { data: existingCliente, error: existingClientError } = await supabase
        .from('clientes')
        .select('id')
        .eq('telefone', telefone)
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (existingClientError) throw existingClientError

      if (existingCliente) {
        finalClienteId = existingCliente.id
      } else {
        // Create new cliente
        const { data: newCliente, error: clienteError } = await supabase
          .from('clientes')
          .insert({
            telefone,
            nome: nome_cliente || 'Desconhecido'
          })
          .select('id')
          .single()

        if (clienteError || !newCliente) {
          return NextResponse.json({ error: 'Erro ao criar cliente' }, { status: 500 })
        }

        finalClienteId = newCliente.id
      }
    }

    if (!finalClienteId) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })
    }

    const clientScope = await loadNexusClientScope(supabase, finalClienteId)
    if (!clientScope) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })
    }

    if (subsetor_id) {
      const { data: subsetor, error: subsetorError } = await supabase
        .from('subsetores')
        .select('id, setor_id, ativo')
        .eq('id', subsetor_id)
        .maybeSingle()
      if (subsetorError) throw subsetorError
      if (!subsetor?.ativo || subsetor.setor_id !== setor_id) {
        return NextResponse.json(
          { error: 'O subsetor não pertence ao setor de destino ou está inativo' },
          { status: 422 },
        )
      }
    }

    let preparedNexusSession = await prepareRecentNexusHistory({
      supabase,
      clientIds: clientScope.clientIds,
      clientPhone: clientScope.clientPhone,
      sourceChannelId,
    })

    if (
      preparedNexusSession
      && preparedNexusSession.sourceSectorId !== setor_id
    ) {
      const { data: allowedDestination, error: destinationError } = await supabase
        .from('setor_destinos_transferencia')
        .select('setor_destino_id')
        .eq('setor_origem_id', preparedNexusSession.sourceSectorId)
        .eq('setor_destino_id', setor_id)
        .maybeSingle()

      if (destinationError) throw destinationError
      if (!allowedDestination) {
        return NextResponse.json(
          { error: 'O setor de destino não está autorizado para esta conversa Nexus' },
          { status: 422 },
        )
      }
    }

    let linkedNexusTicketId = sourceChannelId
      ? await findActiveNexusTicketIdForClientChannel({
          supabase,
          sourceChannelId,
          allowedClientIds: clientScope.clientIds,
        })
      : null

    // A retry can arrive after the 25-minute live window. Recover the latest
    // pending session only if it resolves to a deterministic ticket that was
    // already created; an old session must never create a new ticket by itself.
    let latestPendingSession: PreparedNexusSession | null = null
    if (sourceChannelId && !preparedNexusSession?.messageIds.length) {
      latestPendingSession = await prepareLatestNexusSessionLink({
        supabase,
        sourceChannelId,
        allowedClientIds: clientScope.clientIds,
        clientPhone: clientScope.clientPhone,
      })

      if (latestPendingSession?.messageIds.length) {
        if (!linkedNexusTicketId) {
          const deterministicTicketId = createNexusSessionTicketId(
            latestPendingSession.sourceSectorId,
            latestPendingSession.messageIds,
          )
          const { data: retryTicket, error: retryTicketError } = await supabase
            .from('tickets')
            .select('id')
            .eq('id', deterministicTicketId)
            .in('cliente_id', clientScope.clientIds)
            .in('status', ['aberto', 'em_atendimento'])
            .maybeSingle()
          if (retryTicketError) throw retryTicketError
          linkedNexusTicketId = retryTicket?.id || null
        }

        if (linkedNexusTicketId) preparedNexusSession = latestPendingSession
      }
    }
    const createExistingTicketQuery = (columns: string) => {
      let query = supabase
        .from('tickets')
        .select(columns)
        .in('status', ['aberto', 'em_atendimento'])

      query = linkedNexusTicketId
        ? query.eq('id', linkedNexusTicketId)
        : sourceChannelId
          // A channel-scoped conversation must not reuse a ticket from another
          // channel merely because both share the same client and sector.
          ? query.eq('id', NO_MATCH_TICKET_ID)
          : query.in('cliente_id', clientScope.clientIds).eq('setor_id', setor_id)
      return query.maybeSingle()
    }

    // Check if there's already an open ticket for this cliente in this setor
    let existingTicketResult = await createExistingTicketQuery(
      'id, setor_id, status, colaborador_id, subsetor_id, tipo_atendimento',
    )
    let classifierColumnAvailable = true
    const missingClassifierColumn = existingTicketResult.error
      && ['42703', 'PGRST204'].includes(existingTicketResult.error.code || '')
      && existingTicketResult.error.message.includes('tipo_atendimento')
    if (missingClassifierColumn) {
      classifierColumnAvailable = false
      existingTicketResult = await createExistingTicketQuery(
        'id, setor_id, status, colaborador_id, subsetor_id',
      ) as typeof existingTicketResult
    }
    if (existingTicketResult.error) throw existingTicketResult.error
    const existingTicket = existingTicketResult.data as unknown as {
      id: string
      setor_id: string
      status: string
      colaborador_id: string | null
      subsetor_id: string | null
      tipo_atendimento?: string | null
    } | null

    if (
      existingTicket
      && !preparedNexusSession?.messageIds.length
      && latestPendingSession?.messageIds.length
    ) {
      if (latestPendingSession.sourceSectorId !== setor_id) {
        const { data: allowedDestination, error: destinationError } = await supabase
          .from('setor_destinos_transferencia')
          .select('setor_destino_id')
          .eq('setor_origem_id', latestPendingSession.sourceSectorId)
          .eq('setor_destino_id', setor_id)
          .maybeSingle()
        if (destinationError) throw destinationError
        if (!allowedDestination) {
          return NextResponse.json(
            { error: 'O setor de destino não está autorizado para esta conversa Nexus' },
            { status: 422 },
          )
        }
      }
      preparedNexusSession = latestPendingSession
    }

    if (existingTicket) {
      const ticketUpdates: Record<string, string> = {}
      const sameRequestedSector = existingTicket.setor_id === setor_id
      const subsetorChanged = Boolean(
        sameRequestedSector
        && subsetor_id
        && existingTicket.subsetor_id !== subsetor_id,
      )
      if (subsetorChanged) ticketUpdates.subsetor_id = subsetor_id
      if (
        classifierColumnAvailable
        && tipoAtendimento
        && existingTicket.tipo_atendimento !== tipoAtendimento
      ) {
        ticketUpdates.tipo_atendimento = tipoAtendimento
      }

      if (Object.keys(ticketUpdates).length > 0) {
        const { error: updateError } = await supabase
          .from('tickets')
          .update(ticketUpdates)
          .eq('id', existingTicket.id)
        if (updateError) {
          return NextResponse.json({ error: 'Erro ao atualizar ticket existente' }, { status: 500 })
        }
      }

      if (subsetorChanged) {
        const { error: logError } = await supabase.from('ticket_logs').insert({
          ticket_id: existingTicket.id,
          tipo: 'transferencia',
          descricao: `Ticket transferido para subsetor`,
        })
        if (logError) console.error('[tickets/criar] Falha ao registrar troca de subsetor:', logError)
      }

      let mensagensNexusVinculadas = 0
      if (preparedNexusSession?.messageIds.length) {
        const currentSession = await refreshPreparedNexusSession({
          supabase,
          preparedSession: preparedNexusSession,
          ticketId: existingTicket.id,
          clientIds: clientScope.clientIds,
          clientPhone: clientScope.clientPhone,
        })
        if (sameRequestedSector) {
          try {
            await logNexusSectorTransfer({
              supabase,
              ticketId: existingTicket.id,
              sourceSectorId: preparedNexusSession.sourceSectorId,
              targetSectorId: setor_id,
            })
          } catch (error) {
            console.warn('[tickets/criar] Log Nexus não registrado no ticket existente:', error)
          }
        }
        mensagensNexusVinculadas = await linkPreparedNexusSessionToTicket({
          supabase,
          messageIds: currentSession.messageIds,
          ticketId: existingTicket.id,
        })
        if (mensagensNexusVinculadas !== currentSession.messageIds.length) {
          throw new Error('Não foi possível vincular toda a sessão Nexus ao ticket existente.')
        }
      }

      return NextResponse.json({
        success: true,
        ticket_id: existingTicket.id,
        existing: true,
        subsetor_updated: subsetorChanged,
        tipo_atendimento_updated: Boolean(ticketUpdates.tipo_atendimento),
        mensagens_nexus_vinculadas: mensagensNexusVinculadas,
        message: Object.keys(ticketUpdates).length > 0
          ? 'Ticket existente atualizado'
          : 'Ticket já existe para este cliente neste setor',
      })
    }

    // Create and distribute the ticket with subsetor
    const result = await criarEDistribuirTicket(
      finalClienteId, 
      setor_id, 
      canal, 
      subsetor_id || null,
      {
        tipoAtendimento,
        idempotency: preparedNexusSession?.messageIds.length
          ? {
              ticketId: createNexusSessionTicketId(
                preparedNexusSession.sourceSectorId,
                preparedNexusSession.messageIds,
              ),
              acceptedClientIds: clientScope.clientIds,
            }
          : undefined,
      },
    )

    if (!result) {
      return NextResponse.json({ error: 'Erro ao criar ticket' }, { status: 500 })
    }

    console.log(`[v0] Ticket created via API: ${result.ticketId}, setor: ${setor_id}, subsetor: ${subsetor_id || 'none'}, assigned to: ${result.colaboradorId || 'none'}`)

    let mensagensNexusVinculadas = 0
    if (preparedNexusSession?.messageIds.length) {
      const currentSession = await refreshPreparedNexusSession({
        supabase,
        preparedSession: preparedNexusSession,
        ticketId: result.ticketId,
        clientIds: clientScope.clientIds,
        clientPhone: clientScope.clientPhone,
      })
      if (result.created) {
        try {
          await logNexusSectorTransfer({
            supabase,
            ticketId: result.ticketId,
            sourceSectorId: preparedNexusSession.sourceSectorId,
            targetSectorId: result.setorId,
          })
        } catch (error) {
          console.warn('[tickets/criar] Ticket criado, mas log Nexus não registrado:', error)
        }
      }
      mensagensNexusVinculadas = await linkPreparedNexusSessionToTicket({
        supabase,
        messageIds: currentSession.messageIds,
        ticketId: result.ticketId,
      })
      if (mensagensNexusVinculadas !== currentSession.messageIds.length) {
        throw new Error('Não foi possível vincular toda a sessão Nexus ao novo ticket.')
      }
    }

    return NextResponse.json({
      success: true,
      ticket_id: result.ticketId,
      colaborador_id: result.colaboradorId,
      existing: !result.created,
      mensagens_nexus_vinculadas: mensagensNexusVinculadas,
      message: !result.created
        ? 'Ticket já criado para esta sessão Nexus'
        : result.colaboradorId
          ? 'Ticket criado e atribuído automaticamente'
          : 'Ticket criado e aguardando atribuição'
    })

  } catch (error) {
    if (error instanceof TicketIdempotencyConflictError) {
      return NextResponse.json({
        error: 'Esta conversa Nexus já foi convertida em outro setor ou subsetor.',
        ticket_id: error.winner.ticketId,
      }, { status: 409 })
    }

    if (error instanceof NexusSessionLinkValidationError) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    console.error('[v0] Error creating ticket:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
