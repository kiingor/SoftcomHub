import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveNexusDashboardAccess } from '@/lib/server/nexus-dashboard-access'
import {
  linkPreparedNexusSessionToTicket,
  loadNexusClientScope,
  logNexusSectorTransfer,
  NexusSessionLinkValidationError,
  NexusSessionTicketClaimConflictError,
  prepareNexusSessionLink,
  prepareNexusSessionLinkWithActiveTicket,
} from '@/lib/server/nexus-message-linking'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createNexusSessionTicketId } from '@/lib/server/nexus-ticket-id'
import {
  criarEDistribuirTicket,
  TicketIdempotencyConflictError,
} from '@/lib/ticket-distribution'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
}

const bodySchema = z.object({
  clienteId: z.string().uuid().nullish(),
  telefone: z.string().trim().max(64).nullish(),
  setorId: z.string().uuid(),
  sourceSectorId: z.string().uuid(),
  subsetorId: z.string().uuid().nullish(),
  sourceMessageIds: z.array(z.string().uuid()).min(1).max(10_000),
})

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS })
}

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json().catch(() => null)
    const parsedBody = bodySchema.safeParse(requestBody)
    if (!parsedBody.success) {
      return privateJson({
        error: 'Dados inválidos para abrir o ticket.',
        details: parsedBody.error.issues[0]?.message,
      }, 400)
    }

    const authClient = await createServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user?.email) {
      return privateJson({ error: 'Não autenticado' }, 401)
    }

    const supabase = createServiceClient()
    const {
      clienteId,
      telefone,
      setorId,
      sourceSectorId,
      subsetorId,
      sourceMessageIds,
    } = parsedBody.data
    const access = await resolveNexusDashboardAccess(supabase, user.email)

    if (!access) return privateJson({ error: 'Acesso negado' }, 403)
    if (!access.sectorIds.includes(sourceSectorId)) {
      return privateJson({ error: 'Setor de origem não autorizado' }, 403)
    }

    if (setorId !== sourceSectorId) {
      const { data: allowedDestination, error } = await supabase
        .from('setor_destinos_transferencia')
        .select('setor_destino_id')
        .eq('setor_origem_id', sourceSectorId)
        .eq('setor_destino_id', setorId)
        .maybeSingle()

      if (error) throw error
      if (!allowedDestination) {
        return privateJson({ error: 'Setor de destino não autorizado' }, 403)
      }
    }

    if (subsetorId) {
      const { data: subsetor, error } = await supabase
        .from('subsetores')
        .select('id, ativo')
        .eq('id', subsetorId)
        .eq('setor_id', setorId)
        .maybeSingle()

      if (error) throw error
      if (!subsetor?.ativo) {
        return privateJson(
          { error: 'O subsetor não pertence ao setor de destino ou está inativo' },
          400,
        )
      }
    }

    let resolvedClient: { id: string; telefone: string | null } | null = null
    if (clienteId) {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, telefone')
        .eq('id', clienteId)
        .maybeSingle()
      if (error) throw error
      resolvedClient = data
    } else if (telefone) {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, telefone')
        .eq('telefone', telefone)
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      resolvedClient = data
    }

    if (!resolvedClient) {
      return privateJson({ error: 'Cliente não encontrado' }, 400)
    }

    const clientScope = await loadNexusClientScope(supabase, resolvedClient.id)
    if (!clientScope) return privateJson({ error: 'Cliente não encontrado' }, 400)

    const {
      preparedSession,
      activeTicket: linkedSessionTicket,
    } = await prepareNexusSessionLinkWithActiveTicket({
      supabase,
      messageIds: sourceMessageIds,
      sourceSectorId,
      allowedClientIds: clientScope.clientIds,
      clientPhone: clientScope.clientPhone,
    })

    const existingTicket: {
      id: string
      setor_id: string
      colaborador_id: string | null
    } | null = linkedSessionTicket

    let ticketId: string
    let colaboradorId: string | null
    let jaExistia = Boolean(existingTicket)
    let shouldLogRequestedTransfer = true
    let actualTicketSectorId = existingTicket?.setor_id || setorId

    if (existingTicket) {
      ticketId = existingTicket.id
      colaboradorId = existingTicket.colaborador_id
    } else {
      const result = await criarEDistribuirTicket(
        resolvedClient.id,
        setorId,
        'whatsapp',
        subsetorId || null,
        {
          idempotency: {
            ticketId: createNexusSessionTicketId(
              preparedSession.sourceSectorId,
              preparedSession.messageIds,
            ),
            acceptedClientIds: clientScope.clientIds,
          },
        },
      )
      if (!result) {
        return privateJson({ error: 'Falha ao criar o ticket' }, 500)
      }
      ticketId = result.ticketId
      colaboradorId = result.colaboradorId
      jaExistia = !result.created
      shouldLogRequestedTransfer = result.created
      actualTicketSectorId = result.setorId
    }

    const currentSession = await prepareNexusSessionLink({
      supabase,
      messageIds: preparedSession.messageIds,
      sourceSectorId,
      allowedClientIds: clientScope.clientIds,
      clientPhone: clientScope.clientPhone,
      targetTicketId: ticketId,
    })

    if (shouldLogRequestedTransfer) {
      try {
        await logNexusSectorTransfer({
          supabase,
          ticketId,
          sourceSectorId,
          targetSectorId: actualTicketSectorId,
        })
      } catch (error) {
        console.warn('[nexus/abrir-ticket] Ticket criado, mas log de transferência não registrado:', error)
      }
    }
    const mensagensVinculadas = await linkPreparedNexusSessionToTicket({
      supabase,
      messageIds: currentSession.messageIds,
      ticketId,
    })

    if (mensagensVinculadas !== currentSession.messageIds.length) {
      throw new Error('Não foi possível vincular toda a sessão Nexus ao ticket.')
    }

    let colaboradorNome: string | null = null
    if (colaboradorId) {
      const { data, error } = await supabase
        .from('colaboradores')
        .select('nome')
        .eq('id', colaboradorId)
        .maybeSingle()
      if (error) throw error
      colaboradorNome = data?.nome || null
    }

    return privateJson({
      success: true,
      ticketId,
      colaboradorId,
      colaboradorNome,
      jaExistia,
      mensagensVinculadas,
    })
  } catch (error) {
    if (error instanceof NexusSessionTicketClaimConflictError) {
      return privateJson({
        error: error.message,
        ticketId: error.winnerTicketId,
      }, 409)
    }

    if (error instanceof TicketIdempotencyConflictError) {
      return privateJson({
        error: 'Esta conversa Nexus já foi convertida em outro setor ou subsetor.',
        ticketId: error.winner.ticketId,
      }, 409)
    }

    if (error instanceof NexusSessionLinkValidationError) {
      return privateJson({ error: error.message }, 409)
    }

    console.error('[nexus/abrir-ticket] Erro inesperado:', error)
    return privateJson({ error: 'Erro interno ao abrir o ticket' }, 500)
  }
}
