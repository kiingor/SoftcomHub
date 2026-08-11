import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  claimPersistedMessageSend,
  completeLegacyPersistedMessageSend,
  completePersistedMessageSend,
  loadLegacyPersistedMessageSend,
  persistAcceptedLegacyMessage,
  type MessageSendAttempt,
  type PersistedMessagePayload,
} from '@/lib/message-send-claim'
import {
  REPLYABLE_TICKET_SENDERS,
  TRUSTED_INBOUND_CLIENT_SENDERS,
  canUseLegacyChannelFallback,
  isConfiguredLegacyEvolutionChannel,
  resolveReplyQuote,
  selectAuthorizedTicketChannel,
  validateOutboundMediaUrl,
} from '@/lib/message-send-target'
import { resolveSharedChannelOwnerId } from '@/lib/nexus-channel-resolution'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { resolveMime } from '@/lib/whatsapp-media'
import { normalizeBrazilianPhone } from '@/lib/phone'
import { authorizeTicketSend } from '@/lib/ticket-send-auth'
import {
  describeUnexpectedError,
  redactSensitiveText,
  sanitizeEvolutionProviderError,
} from '@/lib/provider-error'

const requestSchema = z.object({
  ticketId: z.string().uuid(),
  message: z.string().max(20_000).nullish(),
  messageId: z.string().uuid().nullish(),
  instanceName: z.string().max(255).nullish(),
  fileUrl: z.string().max(4_096).nullish(),
  fileType: z.string().max(255).nullish(),
  fileName: z.string().max(512).nullish(),
  replyToMessageId: z.string().uuid().nullish(),
  retry: z.boolean().optional(),
}).strict()

function getEvolutionMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const directKey = root.key
  if (directKey && typeof directKey === 'object') {
    const id = (directKey as Record<string, unknown>).id
    if (typeof id === 'string') return id
  }

  const message = root.message
  if (!message || typeof message !== 'object') return null
  const nestedKey = (message as Record<string, unknown>).key
  if (!nestedKey || typeof nestedKey !== 'object') return null
  const nestedId = (nestedKey as Record<string, unknown>).id
  return typeof nestedId === 'string' ? nestedId : null
}

async function persistFailure(
  serviceClient: ReturnType<typeof createServiceClient> | null,
  attempt: MessageSendAttempt | null,
  error: string,
) {
  if (!serviceClient || !attempt) return null
  // `erro_envio` é exibido no WorkDesk e copiado para error_logs — o texto não
  // pode carregar telefone, credencial ou URL do provedor.
  const result = await completePersistedMessageSend(serviceClient, attempt, {
    status: 'falhou',
    error: redactSensitiveText(error),
  })
  if (result.ok) return null
  return NextResponse.json(
    {
      error: result.error,
      code: result.code,
      providerAccepted: false,
      status_envio: 'enviando',
    },
    { status: 500 },
  )
}

export async function POST(request: NextRequest) {
  let serviceClient: ReturnType<typeof createServiceClient> | null = null
  let sendAttempt: MessageSendAttempt | null = null
  let providerRequestStarted = false

  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parâmetros de envio inválidos', code: 'INVALID_SEND_REQUEST' },
        { status: 400 },
      )
    }
    const body = parsed.data
    const {
      ticketId,
      message,
      messageId,
      instanceName,
      fileUrl,
      fileType,
      fileName,
      replyToMessageId,
      retry = false,
    } = body
    if (!ticketId || (!messageId && !message && !fileUrl)) {
      return NextResponse.json(
        { error: 'Missing required fields: ticketId, message or fileUrl' },
        { status: 400 },
      )
    }

    const sendAuth = await authorizeTicketSend(supabase, ticketId, user.email)
    if (!sendAuth.ok) {
      return NextResponse.json(
        { error: sendAuth.error, code: sendAuth.code },
        { status: sendAuth.status },
      )
    }
    if (retry === true && !messageId) {
      return NextResponse.json(
        { error: 'Retry exige uma mensagem persistida', code: 'RETRY_REQUIRES_MESSAGE_ID' },
        { status: 400 },
      )
    }

    serviceClient ||= createServiceClient()
    const authoritativeClient = serviceClient

    let persistedMessage: PersistedMessagePayload | null = null
    let legacyPersistedMessage = false

    if (messageId) {
      const claim = await claimPersistedMessageSend(
        serviceClient,
        ticketId,
        messageId,
        retry === true,
      )
      if (!claim.ok) {
        if (claim.code === 'SEND_STATUS_SCHEMA_UNAVAILABLE' && retry !== true) {
          const legacyMessage = await loadLegacyPersistedMessageSend(
            serviceClient,
            ticketId,
            messageId,
          )
          if (!legacyMessage.ok) {
            return NextResponse.json(
              { error: legacyMessage.error, code: legacyMessage.code },
              { status: legacyMessage.status },
            )
          }
          if (legacyMessage.providerMessageId) {
            return NextResponse.json({
              success: true,
              idempotent: true,
              legacy: true,
              messageId: legacyMessage.providerMessageId,
            })
          }
          persistedMessage = legacyMessage.message
          legacyPersistedMessage = true
        } else {
          return NextResponse.json(
            {
              error: claim.error,
              code: claim.code,
              status_envio: claim.status_envio,
            },
            { status: claim.status },
          )
        }
      } else if (claim.kind === 'already_sent') {
        return NextResponse.json({
          success: true,
          idempotent: true,
          status_envio: claim.status_envio,
          messageId: claim.providerMessageId,
        })
      } else {
        sendAttempt = claim.attempt
        persistedMessage = claim.attempt.message
      }
    }

    const sendMessage = persistedMessage ? persistedMessage.content : message
    let mediaUrl = persistedMessage ? persistedMessage.fileUrl : fileUrl
    const mediaType = persistedMessage ? persistedMessage.mediaType : fileType
    const mediaFileName = persistedMessage ? null : fileName
    const requestedInstance = persistedMessage
      ? persistedMessage.phoneNumberId
      : instanceName
    const effectiveReplyToMessageId = persistedMessage
      ? persistedMessage.replyToMessageId
      : replyToMessageId ?? null

    if (!sendMessage && !mediaUrl) {
      const error = 'A mensagem persistida não possui conteúdo para envio'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error,
          code: 'MESSAGE_CONTENT_INVALID',
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: 422 },
      )
    }

    if (mediaUrl) {
      const validatedMedia = validateOutboundMediaUrl(mediaUrl)
      if (!validatedMedia.ok) {
        const persistenceFailure = await persistFailure(
          serviceClient,
          sendAttempt,
          validatedMedia.error,
        )
        if (persistenceFailure) return persistenceFailure
        sendAttempt = null
        return NextResponse.json(
          {
            error: validatedMedia.error,
            code: validatedMedia.code,
            status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
          },
          { status: 422 },
        )
      }
      mediaUrl = validatedMedia.url
    }

    let quotedPayload: Record<string, unknown> | null = null
    if (effectiveReplyToMessageId) {
      const { data: parent, error: parentError } = await authoritativeClient
        .from('mensagens')
        .select('whatsapp_message_id, remetente, conteudo')
        .eq('id', effectiveReplyToMessageId)
        .eq('ticket_id', ticketId)
        .in('remetente', [...REPLYABLE_TICKET_SENDERS])
        .maybeSingle()

      const replyQuote = resolveReplyQuote(parent, Boolean(parentError))
      if (!replyQuote.ok) {
        const persistenceFailure = await persistFailure(serviceClient, sendAttempt, replyQuote.error)
        if (persistenceFailure) return persistenceFailure
        sendAttempt = null
        return NextResponse.json(
          {
            error: replyQuote.error,
            code: replyQuote.code,
            status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
          },
          { status: 422 },
        )
      }

      if (replyQuote.providerMessageId) {
        quotedPayload = {
          key: {
            id: replyQuote.providerMessageId,
            fromMe: parent?.remetente === 'colaborador',
          },
          message: {
            conversation: parent?.conteudo || '',
          },
        }
      }
    }

    // Get ticket to find setor and client phone
    const { data: ticket } = await authoritativeClient
      .from('tickets')
      .select('setor_id, cliente_id, clientes(telefone)')
      .eq('id', ticketId)
      .single()

    if (!ticket?.setor_id) {
      const error = 'Ticket ou setor nao encontrado'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error,
          code: 'TICKET_NOT_FOUND',
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: 404 },
      )
    }

    const ticketClient = Array.isArray(ticket.clientes)
      ? ticket.clientes[0]
      : ticket.clientes
    const clientePhone = ticketClient?.telefone
    if (!clientePhone) {
      const error = 'Telefone do cliente nao encontrado'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error,
          code: 'RECIPIENT_NOT_FOUND',
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: 400 },
      )
    }

    let evolutionBaseUrl: string | null = null
    let evolutionApiKey: string | null = null
    let resolvedInstance = requestedInstance

    const { data: channels, error: channelsError } = await authoritativeClient
      .from('setor_canais')
      .select('id, setor_id, instancia, evolution_base_url, evolution_api_key, ativo')
      .eq('setor_id', ticket.setor_id)
      .eq('tipo', 'evolution_api')
      .order('id', { ascending: true })

    if (channelsError) throw channelsError
    const currentModernChannels = channels || []
    const currentActiveChannels = currentModernChannels.filter(
      (candidate) => candidate.ativo,
    )
    let matchingModernChannels = currentModernChannels
    let matchingActiveChannels = currentActiveChannels
    let historicalEvidence: Array<{
      channelIdentifier: string | null
      sender: string | null
      providerMessageId: string | null
    }> = []

    if (requestedInstance) {
      const { data: matchingChannels, error: matchingChannelsError } = await authoritativeClient
        .from('setor_canais')
        .select('id, setor_id, instancia, evolution_base_url, evolution_api_key, ativo')
        .eq('tipo', 'evolution_api')
        .eq('instancia', requestedInstance)
        .order('id', { ascending: true })
        .limit(1000)

      if (matchingChannelsError) throw matchingChannelsError
      matchingModernChannels = matchingChannels || []
      matchingActiveChannels = matchingModernChannels.filter(
        (candidate) => candidate.ativo,
      )

      const belongsToCurrentSector = currentActiveChannels.some(
        (candidate) => candidate.instancia === requestedInstance,
      )
      if (!belongsToCurrentSector) {
        const { data: priorInboundMessages, error: priorInboundError } = await authoritativeClient
          .from('mensagens')
          .select('phone_number_id, remetente, whatsapp_message_id')
          .eq('ticket_id', ticketId)
          .in('remetente', [...TRUSTED_INBOUND_CLIENT_SENDERS])
          .eq('phone_number_id', requestedInstance)
          .limit(1)

        if (priorInboundError) throw priorInboundError
        historicalEvidence = (priorInboundMessages || []).map((priorMessage) => ({
          channelIdentifier: priorMessage.phone_number_id,
          sender: priorMessage.remetente,
          providerMessageId: priorMessage.whatsapp_message_id,
        }))
      }
    }

    // Instância compartilhada entre setores: o setor do ticket é o dono
    // preferido. A autorização de uso já aconteceu antes; aqui só se decide de
    // qual linha de `setor_canais` vêm as credenciais.
    const resolveOwnerId = (ownerIds: Iterable<string>) =>
      resolveSharedChannelOwnerId(ownerIds, ticket.setor_id)

    const modernChannel = selectAuthorizedTicketChannel({
      currentActiveChannels,
      matchingActiveChannels,
      historicalEvidence,
      requestedIdentifier: requestedInstance,
      getIdentifier: (candidate) => candidate.instancia,
      getOwnerId: (candidate) => candidate.setor_id,
      resolveOwnerId,
    })

    let legacyChannel: {
      id: string
      setor_id: string
      channel_identifier: string | null
      instancia: string | null
      phone_number_id: string | null
      evolution_base_url: string | null
      evolution_api_key: string | null
    } | null = null
    const relevantModernConfigurations = requestedInstance
      ? matchingModernChannels
      : currentModernChannels

    if (
      !modernChannel
      && canUseLegacyChannelFallback(relevantModernConfigurations)
    ) {
      type LegacyEvolutionSector = {
        id: string
        canal: string | null
        phone_number_id: string | null
        evolution_base_url: string | null
        evolution_api_key: string | null
      }
      let legacySectors: LegacyEvolutionSector[] = []

      if (requestedInstance) {
        const { data, error } = await authoritativeClient
          .from('setores')
          .select('id, canal, phone_number_id, evolution_base_url, evolution_api_key')
          .eq('phone_number_id', requestedInstance)
          .order('id', { ascending: true })
          .limit(1000)
        if (error) throw error
        legacySectors = data || []
      } else {
        const { data, error } = await authoritativeClient
          .from('setores')
          .select('id, canal, phone_number_id, evolution_base_url, evolution_api_key')
          .eq('id', ticket.setor_id)
          .order('id', { ascending: true })
          .limit(1)
        if (error) throw error
        legacySectors = data || []
      }

      const configuredLegacyChannels = legacySectors
        .filter((sector) => isConfiguredLegacyEvolutionChannel({
          ...sector,
          instancia: null,
        }))
        .map((sector) => ({
          id: `legacy:${sector.id}`,
          setor_id: sector.id,
          channel_identifier: sector.phone_number_id,
          instancia: null,
          phone_number_id: sector.phone_number_id,
          evolution_base_url: sector.evolution_base_url,
          evolution_api_key: sector.evolution_api_key,
        }))
      const currentLegacyChannels = configuredLegacyChannels.filter(
        (candidate) => candidate.setor_id === ticket.setor_id,
      )

      legacyChannel = selectAuthorizedTicketChannel({
        currentActiveChannels: currentLegacyChannels,
        matchingActiveChannels: configuredLegacyChannels,
        historicalEvidence,
        requestedIdentifier: requestedInstance,
        getIdentifier: (candidate) => candidate.channel_identifier,
        getOwnerId: (candidate) => candidate.setor_id,
        resolveOwnerId,
      })
    }

    if (!modernChannel && !legacyChannel) {
      const error = 'A instância informada não pertence ao setor atual do ticket'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error,
          code: 'CHANNEL_MISMATCH',
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: 422 },
      )
    }

    evolutionBaseUrl =
      modernChannel?.evolution_base_url
      || legacyChannel?.evolution_base_url
      || null
    evolutionApiKey =
      modernChannel?.evolution_api_key
      || legacyChannel?.evolution_api_key
      || null
    resolvedInstance =
      modernChannel?.instancia
      || legacyChannel?.channel_identifier
      || null

    if (!evolutionBaseUrl || !evolutionApiKey) {
      const error = 'EvolutionAPI nao configurada neste setor'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error,
          code: 'CHANNEL_NOT_CONFIGURED',
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: 500 },
      )
    }

    if (!resolvedInstance) {
      const errMsg = 'Nao foi possivel determinar a instancia (instanceName). Nenhuma mensagem do cliente com phone_number_id encontrada.'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, errMsg)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error: errMsg,
          code: 'CHANNEL_NOT_CONFIGURED',
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: 400 },
      )
    }

    // Format phone number
    // If phone has @lid suffix (Evolution API LID format), preserve it exactly as-is.
    // Otherwise strip non-digits for the standard number format.
    const formattedPhone = clientePhone.includes('@')
      ? clientePhone
      : normalizeBrazilianPhone(clientePhone)

    // Remove trailing slash from base URL
    const baseUrl = evolutionBaseUrl.replace(/\/+$/, '')

    // Determine if this is a media or text message
    const isMedia = !!mediaUrl
    let evolutionUrl: string
    let evolutionBody: Record<string, unknown>

    if (isMedia) {
      // Resolve canonical MIME — browsers leave `file.type` empty for many
      // extensions (.cer, .p12, .key, .xml, .json, …) which Evolution then
      // refuses if we forward "application/octet-stream". Inferring from the
      // filename fixes the cert path on Evolution.
      const mimetype = resolveMime(mediaType, mediaFileName || mediaUrl)
      const mtLower = mimetype.toLowerCase()
      let mediatype: 'image' | 'video' | 'audio' | 'document' = 'document'

      if (mtLower.startsWith('image/')) mediatype = 'image'
      else if (mtLower.startsWith('video/')) mediatype = 'video'
      else if (mtLower.startsWith('audio/')) mediatype = 'audio'

      if (mediatype === 'audio') {
        // Voice note (PTT) endpoint — appears with play bubble in WhatsApp
        evolutionUrl = `${baseUrl}/message/sendWhatsAppAudio/${resolvedInstance}`
        evolutionBody = {
          number: formattedPhone,
          audio: mediaUrl,
          delay: 1000,
          encoding: true,
        }
      } else {
        evolutionUrl = `${baseUrl}/message/sendMedia/${resolvedInstance}`
        evolutionBody = {
          number: formattedPhone,
          mediatype,
          mimetype,
          media: mediaUrl,
          fileName: mediaFileName || mediaUrl?.split('/').pop()?.split('?')[0] || 'arquivo',
          caption: sendMessage || '',
          delay: 1000,
        }
      }
    } else {
      evolutionUrl = `${baseUrl}/message/sendText/${resolvedInstance}`
      evolutionBody = {
        number: formattedPhone,
        text: sendMessage,
        delay: 1000,
      }
    }

    // Attach quoted-reply context to whichever endpoint we ended up with.
    // Evolution's sendText/sendMedia/sendWhatsAppAudio all accept `quoted`.
    if (quotedPayload) {
      evolutionBody.quoted = quotedPayload
    }

    // Verificar se a instância está conectada antes de enviar
    try {
      const statusUrl = `${baseUrl}/instance/connectionState/${resolvedInstance}`
      const statusResponse = await fetch(statusUrl, {
        method: 'GET',
        headers: { apikey: evolutionApiKey },
      })

      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        const state = statusData?.instance?.state || statusData?.state
        if (state && state !== 'open' && state !== 'connected') {
          console.error('[EvolutionAPI Send] Instância offline')
          const offlineMsg = 'Dispositivo offline. A instância não está conectada ao WhatsApp. Verifique a conexão do dispositivo.'
          const persistenceFailure = await persistFailure(serviceClient, sendAttempt, offlineMsg)
          if (persistenceFailure) return persistenceFailure
          sendAttempt = null
          return NextResponse.json(
            {
              error: offlineMsg,
              code: 'DEVICE_OFFLINE',
              deviceOffline: true,
              status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
            },
            { status: 503 },
          )
        }
      }
    } catch {
      console.warn('[EvolutionAPI Send] Não foi possível verificar o status da instância')
      // Continua tentando enviar mesmo sem conseguir checar status
    }

    const latestAuthorization = await authorizeTicketSend(supabase, ticketId, user.email)
    if (
      !latestAuthorization.ok
      || latestAuthorization.ticket.setor_id !== ticket.setor_id
    ) {
      const error = latestAuthorization.ok
        ? 'O ticket mudou de setor durante o envio'
        : latestAuthorization.error
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error,
          code: latestAuthorization.ok
            ? 'TICKET_CONTEXT_CHANGED'
            : latestAuthorization.code,
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: latestAuthorization.ok ? 409 : latestAuthorization.status },
      )
    }

    // Send message via EvolutionAPI
    providerRequestStarted = true
    const evolutionResponse = await fetch(evolutionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionApiKey,
      },
      body: JSON.stringify(evolutionBody),
    })

    let evolutionData: unknown
    try {
      evolutionData = await evolutionResponse.json()
    } catch {
      evolutionData = { message: 'Resposta inválida da Evolution API' }
    }

    if (!evolutionResponse.ok) {
      const providerDetails = sanitizeEvolutionProviderError(evolutionData, evolutionResponse.status)
      console.error('[EvolutionAPI Send] Provider rejected the message:', providerDetails)

      // Detectar erro de dispositivo desconectado nas respostas de erro
      const errorStr = JSON.stringify(evolutionData).toLowerCase()
      const isDeviceOffline = errorStr.includes('not connected') ||
        errorStr.includes('disconnected') ||
        errorStr.includes('qr code') ||
        errorStr.includes('connection closed') ||
        errorStr.includes('not found') ||
        evolutionResponse.status === 404

      if (isDeviceOffline) {
        const offlineMsg = 'Dispositivo offline. Não foi possível enviar a mensagem porque a instância está desconectada. Verifique a conexão do WhatsApp.'
        const persistenceFailure = await persistFailure(serviceClient, sendAttempt, offlineMsg)
        if (persistenceFailure) return persistenceFailure
        sendAttempt = null
        return NextResponse.json(
          {
            error: offlineMsg,
            code: 'DEVICE_OFFLINE',
            deviceOffline: true,
            status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
          },
          { status: 503 },
        )
      }

      const genericErrorMsg = 'Erro ao enviar mensagem via EvolutionAPI'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, genericErrorMsg)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error: genericErrorMsg,
          code: 'PROVIDER_SEND_FAILED',
          details: providerDetails,
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: evolutionResponse.status },
      )
    }

    // Persist Evolution's returned message key. Without this, replies to our
    // own Evolution-sent messages can't be quoted natively (the workdesk has
    // no wamid to put into the next `quoted` payload).
    const evolutionMsgId = getEvolutionMessageId(evolutionData)

    let savedMessage: Record<string, unknown> | null = null
    if (messageId && legacyPersistedMessage) {
      const completion = await completeLegacyPersistedMessageSend(
        serviceClient!,
        ticketId,
        messageId,
        evolutionMsgId,
        resolvedInstance,
      )
      if (!completion.ok) {
        return NextResponse.json(
          {
            error: completion.error,
            code: completion.code,
            providerAccepted: true,
          },
          { status: 500 },
        )
      }
    } else if (messageId) {
      const completion = await completePersistedMessageSend(serviceClient!, sendAttempt!, {
        status: 'enviado',
        providerMessageId: evolutionMsgId,
        phoneNumberId: resolvedInstance,
      })
      if (!completion.ok) {
        return NextResponse.json(
          {
            error: completion.error,
            code: completion.code,
            providerAccepted: true,
            status_envio: 'enviando',
          },
          { status: 500 },
        )
      }
      sendAttempt = null
    } else {
      const mtLower = (mediaType || '').toLowerCase()
      const messageType = mtLower.startsWith('image/') ? 'imagem'
        : mtLower.startsWith('audio/') ? 'audio'
        : mtLower.startsWith('video/') ? 'video'
        : mediaUrl ? 'documento'
        : 'texto'
      serviceClient ||= createServiceClient()
      const persistence = await persistAcceptedLegacyMessage(serviceClient, {
        ticketId,
        clientId: ticket.cliente_id,
        content: sendMessage || '',
        type: messageType,
        fileUrl: mediaUrl,
        mediaType,
        phoneNumberId: resolvedInstance,
        channel: 'evolutionapi',
        replyToMessageId: effectiveReplyToMessageId,
        providerMessageId: evolutionMsgId,
      })
      if (!persistence.ok) {
        return NextResponse.json({
          success: true,
          warning: 'Mensagem enviada, mas não foi possível salvar no histórico',
          providerAccepted: true,
          messageId: evolutionMsgId,
        })
      }
      savedMessage = persistence.message
    }

    await supabase
      .from('tickets')
      .update({ primeira_resposta_em: new Date().toISOString() })
      .eq('id', ticketId)
      .in('status', ['aberto', 'em_atendimento'])
      .is('primeira_resposta_em', null)

    // Só o id devolvido pelo provedor sai daqui. O payload bruto traz o
    // `remoteJid` do cliente e o eco da mensagem enviada, e nenhum consumidor
    // do endpoint precisa dele.
    return NextResponse.json({
      success: true,
      message: savedMessage,
      messageId: evolutionMsgId,
      status_envio: messageId && !legacyPersistedMessage ? 'enviado' : undefined,
      legacy: legacyPersistedMessage || undefined,
    })
  } catch (error) {
    const internalFailure = redactSensitiveText(
      error instanceof Error ? error.message : 'Erro interno no envio',
    )
    // O nome da classe do erro só ajuda no log; `erro_envio` continua guardando
    // exatamente a mensagem de antes, apenas sem o que não pode ser exibido.
    console.error(
      '[EvolutionAPI Send] Falha interna de envio:',
      describeUnexpectedError(error, internalFailure),
    )
    if (serviceClient && sendAttempt) {
      const status = providerRequestStarted ? 'indeterminado' : 'falhou'
      const completion = await completePersistedMessageSend(serviceClient, sendAttempt, {
        status,
        error: internalFailure,
      })
      if (!completion.ok) {
        return NextResponse.json(
          {
            error: completion.error,
            code: completion.code,
            providerAccepted: providerRequestStarted,
            status_envio: 'enviando',
          },
          { status: 500 },
        )
      }
      return NextResponse.json(
        {
          error: providerRequestStarted
            ? 'Não foi possível confirmar o envio no provedor'
            : 'Erro interno antes do envio',
          code: providerRequestStarted
            ? 'MESSAGE_SEND_INDETERMINATE'
            : 'MESSAGE_SEND_FAILED',
          status_envio: status,
        },
        { status: providerRequestStarted ? 502 : 500 },
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
