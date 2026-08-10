import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { resolveSharedChannelOwnerId } from '@/lib/nexus-channel-resolution'
import {
  criarEDistribuirTicket,
  TicketIdempotencyConflictError,
} from '@/lib/ticket-distribution'
import {
  linkPreparedNexusSessionToTicket,
  loadNexusClientScope,
  NexusSessionLinkValidationError,
  prepareNexusSessionLink,
  prepareRecentNexusSessionLink,
} from '@/lib/server/nexus-message-linking'
import {
  createNexusSessionTicketId,
  createWhatsappInboundMessageId,
  createWhatsappInboundTicketId,
} from '@/lib/server/nexus-ticket-id'

type ServiceClient = ReturnType<typeof createServiceClient>

type ConfiguredWebhookChannel = {
  setorId: string
  canalEnvio: string
  identifiers: string[]
  isNexus: boolean
}

type ActiveChannelRow = {
  id: string
  setor_id: string
  tipo: string | null
  phone_number_id: string | null
  instancia: string | null
}

type ActiveChannelResolution = {
  channel: ActiveChannelRow
  isNexus: boolean
}

class WebhookChannelAmbiguityError extends Error {
  constructor() {
    super('O identificador do canal está vinculado a mais de um canal ativo.')
    this.name = 'WebhookChannelAmbiguityError'
  }
}

class WebhookIdempotencyConflictError extends Error {
  constructor() {
    super('O identificador externo da mensagem conflita com outro registro.')
    this.name = 'WebhookIdempotencyConflictError'
  }
}

function normalizeCanalEnvio(tipo: string | null) {
  return tipo === 'evolution_api' ? 'evolutionapi' : tipo || 'whatsapp'
}

function parseProviderTimestampMs(value: unknown) {
  const numericTimestamp = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN
  if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) return undefined

  const timestampMs = numericTimestamp < 100_000_000_000
    ? numericTimestamp * 1000
    : numericTimestamp
  return Number.isFinite(timestampMs) && timestampMs <= 8_640_000_000_000_000
    ? timestampMs
    : undefined
}

async function loadActiveChannelMatches(
  supabase: ServiceClient,
  sourceIdentifier: string,
) {
  const [phoneResult, instanceResult] = await Promise.all([
    supabase
      .from('setor_canais')
      .select('id, setor_id, tipo, phone_number_id, instancia')
      .eq('phone_number_id', sourceIdentifier)
      .eq('ativo', true)
      .order('id', { ascending: true })
      .limit(1000),
    supabase
      .from('setor_canais')
      .select('id, setor_id, tipo, phone_number_id, instancia')
      .eq('instancia', sourceIdentifier)
      .eq('ativo', true)
      .order('id', { ascending: true })
      .limit(1000),
  ])
  if (phoneResult.error) throw phoneResult.error
  if (instanceResult.error) throw instanceResult.error

  const activeChannels = new Map<string, ActiveChannelRow>()
  for (const channel of [...(phoneResult.data || []), ...(instanceResult.data || [])]) {
    activeChannels.set(channel.id, channel as ActiveChannelRow)
  }
  return activeChannels
}

async function resolvePrimaryActiveChannel(
  supabase: ServiceClient,
  activeChannels: ReadonlyMap<string, ActiveChannelRow>,
): Promise<ActiveChannelResolution | null> {
  if (activeChannels.size === 0) return null

  const sectorIds = [...new Set(
    [...activeChannels.values()].map((channel) => channel.setor_id),
  )]
  const { data: sectors, error } = await supabase
    .from('setores')
    .select('id, assistente_ia')
    .in('id', sectorIds)
  if (error) throw error
  if ((sectors || []).length !== sectorIds.length) {
    throw new Error('Setor do canal não encontrado.')
  }

  const nexusSectorIds = new Set(
    (sectors || [])
      .filter((sector) => sector.assistente_ia)
      .map((sector) => sector.id),
  )
  const primarySectorId = resolveSharedChannelOwnerId(sectorIds)
  if (!primarySectorId) throw new WebhookChannelAmbiguityError()

  const primaryChannels = [...activeChannels.values()]
    .filter((channel) => channel.setor_id === primarySectorId)
  if (primaryChannels.length !== 1) throw new WebhookChannelAmbiguityError()

  return {
    channel: primaryChannels[0],
    isNexus: nexusSectorIds.has(primarySectorId),
  }
}

async function resolveConfiguredWebhookChannel(
  supabase: ServiceClient,
  sourceIdentifier: string | null,
): Promise<ConfiguredWebhookChannel | null> {
  if (!sourceIdentifier) return null

  const activeChannels = await loadActiveChannelMatches(supabase, sourceIdentifier)
  const activeResolution = await resolvePrimaryActiveChannel(supabase, activeChannels)
  if (activeResolution) {
    const { channel: activeChannel } = activeResolution
    const identifiers = [...new Set([
      activeChannel.phone_number_id,
      activeChannel.instancia,
    ].filter((identifier): identifier is string => Boolean(identifier)))]
    for (const identifier of identifiers) {
      const aliasMatches = await loadActiveChannelMatches(supabase, identifier)
      const aliasResolution = await resolvePrimaryActiveChannel(supabase, aliasMatches)
      if (aliasResolution?.channel.id !== activeChannel.id) {
        throw new WebhookChannelAmbiguityError()
      }
    }

    return {
      setorId: activeChannel.setor_id,
      canalEnvio: normalizeCanalEnvio(activeChannel.tipo),
      identifiers,
      isNexus: activeResolution.isNexus,
    }
  }

  const { data: legacySectors, error: legacyError } = await supabase
    .from('setores')
    .select('id, assistente_ia')
    .eq('phone_number_id', sourceIdentifier)
    .order('id', { ascending: true })
    .limit(1000)
  if (legacyError) throw legacyError
  const primaryLegacySectorId = resolveSharedChannelOwnerId(
    (legacySectors || []).map((sector) => sector.id),
  )
  if ((legacySectors || []).length > 0 && !primaryLegacySectorId) {
    throw new WebhookChannelAmbiguityError()
  }

  const legacySector = (legacySectors || [])
    .find((sector) => sector.id === primaryLegacySectorId)
  return legacySector
    ? {
        setorId: legacySector.id,
        canalEnvio: 'whatsapp',
        identifiers: [sourceIdentifier],
        isNexus: Boolean(legacySector.assistente_ia),
      }
    : null
}

async function findProcessedInboundMessage(
  supabase: ServiceClient,
  deterministicMessageId: string,
  providerMessageId: string,
) {
  const { data: messageById, error: idLookupError } = await supabase
    .from('mensagens')
    .select('id, whatsapp_message_id')
    .eq('id', deterministicMessageId)
    .maybeSingle()
  if (idLookupError) throw idLookupError
  if (messageById) {
    if (messageById.whatsapp_message_id !== providerMessageId) {
      throw new WebhookIdempotencyConflictError()
    }
    return messageById
  }

  const { data: messageByProviderId, error: providerLookupError } = await supabase
    .from('mensagens')
    .select('id, whatsapp_message_id')
    .eq('whatsapp_message_id', providerMessageId)
    .limit(1)
    .maybeSingle()
  if (providerLookupError) throw providerLookupError
  return messageByProviderId
}

async function findActiveTicketIdFromChannelHistory({
  supabase,
  channelIdentifiers,
  clientIds,
}: {
  supabase: ServiceClient
  channelIdentifiers: readonly string[]
  clientIds: readonly string[]
}) {
  if (channelIdentifiers.length === 0 || clientIds.length === 0) return null

  for (let page = 0; page < 10; page += 1) {
    const from = page * 1000
    const { data: messages, error: messagesError } = await supabase
      .from('mensagens')
      .select('ticket_id, enviado_em')
      .in('phone_number_id', [...channelIdentifiers])
      .in('cliente_id', [...clientIds])
      .not('ticket_id', 'is', null)
      .order('enviado_em', { ascending: false })
      .range(from, from + 999)
    if (messagesError) throw messagesError

    const ticketIds = [...new Set(
      (messages || [])
        .map((message) => message.ticket_id)
        .filter((ticketId): ticketId is string => Boolean(ticketId)),
    )]
    if (ticketIds.length > 0) {
      const { data: activeTickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('id')
        .in('id', ticketIds)
        .in('status', ['aberto', 'em_atendimento'])
      if (ticketsError) throw ticketsError

      const activeTicketIds = new Set((activeTickets || []).map((ticket) => ticket.id))
      const activeMessage = (messages || []).find((message) => (
        message.ticket_id && activeTicketIds.has(message.ticket_id)
      ))
      if (activeMessage?.ticket_id) return activeMessage.ticket_id
    }
    if ((messages || []).length < 1000) break
  }

  return null
}

// Webhook verification (GET request from WhatsApp)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[v0] Webhook verified successfully')
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

// Receive messages (POST request from WhatsApp)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Webhook is called by external systems (WhatsApp/Evolution) without user session
    const supabase = createServiceClient()

    // Process WhatsApp Cloud API webhook payload
    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value

    if (!value?.messages?.[0]) {
      // Not a message event, could be status update
      return NextResponse.json({ status: 'ok' })
    }

    const message = value.messages[0]
    const contact = value.contacts?.[0]
    const metadata = value.metadata

    const phoneNumber = message.from
    const customerName = contact?.profile?.name || 'Desconhecido'
    const messageContent = message.text?.body || ''
    const messageType = String(message.type || 'texto')
    const phoneNumberId = typeof metadata?.phone_number_id === 'string'
      ? metadata.phone_number_id.trim() || null
      : null
    const providerMessageId = typeof message.id === 'string'
      ? message.id.trim()
      : ''
    if (!providerMessageId) {
      return NextResponse.json(
        { error: 'Identificador da mensagem não informado' },
        { status: 400 },
      )
    }

    const deterministicMessageId = createWhatsappInboundMessageId(providerMessageId)
    const processedMessage = await findProcessedInboundMessage(
      supabase,
      deterministicMessageId,
      providerMessageId,
    )
    if (processedMessage) {
      return NextResponse.json({ status: 'ok', duplicate: true })
    }

    const providerTimestampMs = parseProviderTimestampMs(message.timestamp)
    const configuredChannel = await resolveConfiguredWebhookChannel(supabase, phoneNumberId)
    const channelIdentifiers = configuredChannel?.identifiers
      || (phoneNumberId ? [phoneNumberId] : [])
    let targetSetorId = configuredChannel?.setorId || null
    const resolvedCanalEnvio = configuredChannel?.canalEnvio || 'whatsapp'

    if (!targetSetorId) {
      const { data: defaultSetor, error: defaultSectorError } = await supabase
        .from('setores')
        .select('id')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (defaultSectorError) throw defaultSectorError
      if (!defaultSetor) {
        console.error('[v0] No sectors found')
        return NextResponse.json({ error: 'No sectors configured' }, { status: 500 })
      }

      targetSetorId = defaultSetor.id
      console.log(`[v0] Using default setor ${targetSetorId}`)
    }
    const resolvedTargetSetorId = targetSetorId
    if (!resolvedTargetSetorId) {
      throw new Error('Setor de destino não resolvido.')
    }

    // Map WhatsApp message types to our types
    const tipoPorMensagem: Record<string, string> = {
      text: 'texto',
      image: 'imagem',
      audio: 'audio',
      video: 'video',
      document: 'documento',
    }
    const tipoMapeado = tipoPorMensagem[messageType] || 'texto'

    // 1. Find or create customer (using upsert to prevent duplicates)
    let { data: cliente, error: clienteError } = await supabase
      .from('clientes')
      .upsert(
        {
          nome: customerName,
          telefone: phoneNumber,
        },
        {
          onConflict: 'telefone',
          ignoreDuplicates: false,
        }
      )
      .select('id')
      .single()

    // If upsert fails, try to find existing customer
    if (clienteError || !cliente) {
      const { data: existingCliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('telefone', phoneNumber)
        .single()

      if (!existingCliente) {
        console.error('[v0] Error finding/creating customer:', clienteError)
        return NextResponse.json({ error: 'Error creating customer' }, { status: 500 })
      }

      cliente = existingCliente
    }

    const clientScope = await loadNexusClientScope(supabase, cliente.id)
    if (!clientScope) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 500 })
    }

    // Reuse by client + sector only when the provider did not identify a
    // channel. A configured channel is reused exclusively through its own
    // message history below, preventing cross-channel ticket mixing.
    let ticket: {
      id: string
      setor_id: string
      cliente_id: string
      colaborador_id: string | null
    } | null = null
    if (channelIdentifiers.length === 0) {
      const existingTicketResult = await supabase
        .from('tickets')
        .select('id, setor_id, cliente_id, colaborador_id')
        .in('cliente_id', clientScope.clientIds)
        .eq('setor_id', resolvedTargetSetorId)
        .in('status', ['aberto', 'em_atendimento'])
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existingTicketResult.error) throw existingTicketResult.error
      ticket = existingTicketResult.data
    }

    let preparedNexusSession = null
    if (configuredChannel?.isNexus && phoneNumberId) {
      preparedNexusSession = await prepareRecentNexusSessionLink({
        supabase,
        sourceChannelId: phoneNumberId,
        allowedClientIds: clientScope.clientIds,
        clientPhone: clientScope.clientPhone,
        ...(providerTimestampMs === undefined ? {} : { nowMs: providerTimestampMs }),
      })
    }

    // Prepare pending messages before checking linked history. This ordering
    // closes the race where another request claims the session between both
    // reads: we either keep the same pending IDs or observe its winning ticket.
    const linkedTicketId = await findActiveTicketIdFromChannelHistory({
      supabase,
      channelIdentifiers,
      clientIds: clientScope.clientIds,
    })
    if (linkedTicketId) {
      const { data: linkedTicket, error: linkedTicketError } = await supabase
        .from('tickets')
        .select('id, setor_id, cliente_id, colaborador_id')
        .eq('id', linkedTicketId)
        .in('status', ['aberto', 'em_atendimento'])
        .maybeSingle()
      if (linkedTicketError) throw linkedTicketError
      if (linkedTicket) ticket = linkedTicket
    }

    if (ticket?.cliente_id) {
      cliente = { id: ticket.cliente_id }
      console.log(`[v0] Found existing ticket ${ticket.id} for phone ${phoneNumber} in setor ${resolvedTargetSetorId}`)
    }

    // Se encontrou ticket existente sem atendente, dispara reprocessamento async.
    // Isso permite que o transbordo seja acionado quando o cliente reativa um ticket
    // parado na fila (todos os atendentes ficaram offline depois da criação).
    if (ticket && !ticket.colaborador_id) {
      console.log(`[webhook] Ticket existente ${ticket.id} sem atendente — disparando reprocessamento async`)
      import('@/lib/ticket-queue-processor')
        .then(({ processTicketQueue }) => {
          processTicketQueue().catch((err) =>
            console.error('[webhook] Erro no reprocessamento async:', err)
          )
        })
        .catch((err) =>
          console.error('[webhook] Erro ao carregar processTicketQueue:', err)
        )
    }

    if (!ticket) {
      // Create and distribute ticket in the resolved setor
      let result
      let actualTicketSectorId = resolvedTargetSetorId
      try {
        result = await criarEDistribuirTicket(
          cliente.id,
          resolvedTargetSetorId,
          'whatsapp',
          null,
          {
            idempotency: {
              ticketId: preparedNexusSession?.messageIds.length
                ? createNexusSessionTicketId(
                    preparedNexusSession.sourceSectorId,
                    preparedNexusSession.messageIds,
                  )
                : createWhatsappInboundTicketId(providerMessageId),
              acceptedClientIds: clientScope.clientIds,
            },
          },
        )
        if (result) actualTicketSectorId = result.setorId
      } catch (error) {
        if (
          error instanceof TicketIdempotencyConflictError
          && ['aberto', 'em_atendimento'].includes(error.winner.status)
        ) {
          result = {
            ticketId: error.winner.ticketId,
            colaboradorId: error.winner.colaboradorId,
            created: false,
            setorId: error.winner.setorId,
          }
          actualTicketSectorId = error.winner.setorId
        } else {
          throw error
        }
      }

      if (!result) {
        console.error('[v0] Error creating ticket')
        return NextResponse.json({ error: 'Error creating ticket' }, { status: 500 })
      }

      ticket = {
        id: result.ticketId,
        setor_id: actualTicketSectorId,
        cliente_id: cliente.id,
        colaborador_id: result.colaboradorId,
      }

      console.log(
        `[v0] Ticket resolved: ${result.ticketId} in setor ${actualTicketSectorId}, assigned to: ${result.colaboradorId || 'none'}`
      )
    }

    if (preparedNexusSession?.messageIds.length && clientScope) {
      try {
        const currentSession = await prepareNexusSessionLink({
          supabase,
          messageIds: preparedNexusSession.messageIds,
          sourceSectorId: preparedNexusSession.sourceSectorId,
          allowedClientIds: clientScope.clientIds,
          clientPhone: clientScope.clientPhone,
          targetTicketId: ticket.id,
        })
        const linkedMessageCount = await linkPreparedNexusSessionToTicket({
          supabase,
          messageIds: currentSession.messageIds,
          ticketId: ticket.id,
        })
        if (linkedMessageCount !== currentSession.messageIds.length) {
          throw new Error('Não foi possível vincular toda a sessão Nexus ao ticket.')
        }
      } catch (error) {
        console.error('[webhook] Backfill Nexus falhou; solicitando nova tentativa:', error)
        return NextResponse.json(
          { error: 'Falha temporária ao vincular histórico Nexus' },
          { status: 503 },
        )
      }
    }

    // 3. Save the message with canal_envio for routing replies
    const { error: messageError } = await supabase.from('mensagens').insert({
      id: deterministicMessageId,
      ticket_id: ticket.id,
      cliente_id: cliente.id,
      remetente: 'cliente',
      conteudo: messageContent,
      tipo: tipoMapeado,
      phone_number_id: phoneNumberId,
      canal_envio: resolvedCanalEnvio,
      whatsapp_message_id: providerMessageId,
    })

    if (messageError) {
      if (messageError.code === '23505') {
        const duplicateMessage = await findProcessedInboundMessage(
          supabase,
          deterministicMessageId,
          providerMessageId,
        )
        if (duplicateMessage) {
          return NextResponse.json({ status: 'ok', duplicate: true })
        }
      }
      console.error('[v0] Error saving message:', messageError)
      return NextResponse.json({ error: 'Error saving message' }, { status: 500 })
    }

    console.log(`[v0] Message received and saved for ticket ${ticket.id}`)

    const clienteRespondeuEm = new Date(providerTimestampMs ?? Date.now()).toISOString()
    const { error: replyTimestampError } = await supabase
      .from('tickets')
      .update({ cliente_respondeu_em: clienteRespondeuEm })
      .eq('id', ticket.id)
      .eq('is_disparo', true)
      .is('cliente_respondeu_em', null)
    if (replyTimestampError) {
      console.warn('[webhook] Unable to register a dispatch reply:', replyTimestampError.message)
    }

    // Web Push para o responsável e gestão ativa do setor; tickets em fila
    // também podem ser assumidos por administradores e supervisores.
    const { notifyAtendenteNovaMensagem } = await import('@/lib/notify-mensagem')
    await notifyAtendenteNovaMensagem({
      ticketId: ticket.id,
      conteudo: messageContent,
      tipo: tipoMapeado,
    })

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    if (error instanceof WebhookChannelAmbiguityError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof WebhookIdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof NexusSessionLinkValidationError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('[v0] Webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
