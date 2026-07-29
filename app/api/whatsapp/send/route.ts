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
  canUseLegacyChannelFallback,
  isConfiguredLegacyWhatsappChannel,
  resolvePersistedRecipient,
  resolveReplyQuote,
  selectAuthorizedTicketChannel,
  validateOutboundMediaUrl,
} from '@/lib/message-send-target'
import { resolveSharedChannelOwnerId } from '@/lib/nexus-channel-resolution'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { checkMetaCompatibility, extFromUrl, resolveMime } from '@/lib/whatsapp-media'
import { authorizeTicketSend } from '@/lib/ticket-send-auth'

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0'
const requestSchema = z.object({
  ticketId: z.string().uuid(),
  message: z.string().max(20_000).nullish(),
  recipientPhone: z.string().max(64).nullish(),
  phoneNumberId: z.string().max(255).nullish(),
  imageUrl: z.string().max(4_096).nullish(),
  fileUrl: z.string().max(4_096).nullish(),
  fileType: z.string().max(255).nullish(),
  fileName: z.string().max(512).nullish(),
  messageId: z.string().uuid().nullish(),
  replyToMessageId: z.string().uuid().nullish(),
  retry: z.boolean().optional(),
}).strict()

async function persistFailure(
  serviceClient: ReturnType<typeof createServiceClient> | null,
  attempt: MessageSendAttempt | null,
  error: string,
) {
  if (!serviceClient || !attempt) return null
  const result = await completePersistedMessageSend(serviceClient, attempt, {
    status: 'falhou',
    error,
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
      recipientPhone,
      phoneNumberId,
      imageUrl,
      fileUrl,
      fileType,
      fileName,
      messageId,
      replyToMessageId,
      retry = false,
    } = body

    const requestedMediaUrl = fileUrl || imageUrl
    if (!ticketId || (!messageId && !message && !requestedMediaUrl) || (!messageId && !recipientPhone)) {
      return NextResponse.json(
        { error: 'Missing required fields: ticketId, message or mediaUrl, recipientPhone' },
        { status: 400 }
      )
    }

    // Ticket precisa estar ativo e o colaborador autenticado precisa estar autorizado
    // nele — cobre tanto o envio inicial quanto o retry (o client já filtra, mas o
    // servidor é a fonte de verdade).
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

    const { data: ticketContext, error: ticketContextError } = await authoritativeClient
      .from('tickets')
      .select('setor_id, cliente_id, clientes(telefone)')
      .eq('id', ticketId)
      .maybeSingle()

    if (ticketContextError || !ticketContext?.setor_id) {
      return NextResponse.json(
        { error: 'Ticket ou setor não encontrado', code: 'TICKET_NOT_FOUND' },
        { status: 404 },
      )
    }

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
              whatsappMessageId: legacyMessage.providerMessageId,
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
          whatsappMessageId: claim.providerMessageId,
        })
      } else {
        sendAttempt = claim.attempt
        persistedMessage = claim.attempt.message
      }
    }

    const sendMessage = persistedMessage ? persistedMessage.content : message
    let mediaUrl = persistedMessage ? persistedMessage.fileUrl : requestedMediaUrl
    const requestedFileType = persistedMessage ? persistedMessage.mediaType : fileType
    const requestedFileName = persistedMessage ? null : fileName
    const requestedPhoneNumberId = persistedMessage
      ? persistedMessage.phoneNumberId
      : phoneNumberId
    const effectiveReplyToMessageId = persistedMessage
      ? persistedMessage.replyToMessageId
      : replyToMessageId ?? null
    const resolvedMime = resolveMime(requestedFileType, requestedFileName) ||
      resolveMime(
        requestedFileType,
        mediaUrl ? `f.${extFromUrl(mediaUrl)}` : '',
      ) ||
      (imageUrl && !persistedMessage ? 'image/jpeg' : '')
    const mediaType = resolvedMime || requestedFileType ||
      (imageUrl && !persistedMessage ? 'image/jpeg' : null)

    if (!sendMessage && !mediaUrl) {
      const error = 'A mensagem persistida não possui conteúdo para envio'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        { error, code: 'MESSAGE_CONTENT_INVALID', status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined },
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
      const compat = checkMetaCompatibility(mediaType || '', requestedFileName)
      if (!compat.accepted) {
        console.warn('[WhatsApp Send] MIME fora da lista recomendada:', compat.reason)
      }
    }

    let replyContextWamid: string | null = null
    if (effectiveReplyToMessageId) {
      const { data: parent, error: parentError } = await authoritativeClient
        .from('mensagens')
        .select('whatsapp_message_id')
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
          { error: replyQuote.error, code: replyQuote.code, status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined },
          { status: 422 },
        )
      }
      replyContextWamid = replyQuote.providerMessageId
    }

    const { data: allModernChannels, error: modernChannelsError } = await authoritativeClient
      .from('setor_canais')
      .select('id, setor_id, phone_number_id, whatsapp_token, ativo')
      .eq('setor_id', ticketContext.setor_id)
      .eq('tipo', 'whatsapp')
      .order('id', { ascending: true })

    if (modernChannelsError) {
      throw modernChannelsError
    }

    const activeChannels = (allModernChannels || []).filter((channel) => channel.ativo)
    let matchingModernChannels = allModernChannels || []
    let matchingActiveChannels = activeChannels
    let historicalEvidence: Array<{
      channelIdentifier: string | null
      sender: string | null
      providerMessageId: string | null
    }> = []

    if (requestedPhoneNumberId) {
      const { data: matchingChannels, error: matchingChannelsError } = await authoritativeClient
        .from('setor_canais')
        .select('id, setor_id, phone_number_id, whatsapp_token, ativo')
        .eq('tipo', 'whatsapp')
        .eq('phone_number_id', requestedPhoneNumberId)
        .order('id', { ascending: true })
        .limit(1000)

      if (matchingChannelsError) throw matchingChannelsError
      matchingModernChannels = matchingChannels || []
      matchingActiveChannels = matchingModernChannels.filter(
        (channel) => channel.ativo,
      )

      const belongsToCurrentSector = activeChannels.some(
        (channel) => channel.phone_number_id === requestedPhoneNumberId,
      )
      if (!belongsToCurrentSector) {
        const { data: priorInboundMessages, error: priorInboundError } = await authoritativeClient
          .from('mensagens')
          .select('phone_number_id, remetente, whatsapp_message_id')
          .eq('ticket_id', ticketId)
          .in('remetente', ['cliente', 'cliente-nexus'])
          .eq('phone_number_id', requestedPhoneNumberId)
          .limit(1)

        if (priorInboundError) throw priorInboundError
        historicalEvidence = (priorInboundMessages || []).map((priorMessage) => ({
          channelIdentifier: priorMessage.phone_number_id,
          sender: priorMessage.remetente,
          providerMessageId: priorMessage.whatsapp_message_id,
        }))
      }
    }

    const modernChannel = selectAuthorizedTicketChannel({
      currentActiveChannels: activeChannels,
      matchingActiveChannels,
      historicalEvidence,
      requestedIdentifier: requestedPhoneNumberId,
      getIdentifier: (channel) => channel.phone_number_id,
      getOwnerId: (channel) => channel.setor_id,
      resolveOwnerId: resolveSharedChannelOwnerId,
    })
    let legacyChannel: {
      id: string
      setor_id: string
      phone_number_id: string | null
      whatsapp_token: string | null
    } | null = null
    const relevantModernConfigurations = requestedPhoneNumberId
      ? matchingModernChannels
      : allModernChannels || []

    if (
      !modernChannel
      && canUseLegacyChannelFallback(relevantModernConfigurations)
    ) {
      let legacyQuery = authoritativeClient
        .from('setores')
        .select('id, canal, phone_number_id, whatsapp_token')
        .order('id', { ascending: true })

      legacyQuery = requestedPhoneNumberId
        ? legacyQuery.eq('phone_number_id', requestedPhoneNumberId)
        : legacyQuery.eq('id', ticketContext.setor_id)

      const { data: legacySectors, error: legacySectorsError } = await legacyQuery.limit(1000)
      if (legacySectorsError) throw legacySectorsError

      // Legacy rows have no per-channel active flag. Treat only an explicitly
      // configured WhatsApp row as usable. A modern row for the identifier,
      // even inactive, deliberately blocks this compatibility path.
      const configuredLegacyChannels = (legacySectors || [])
        .filter((sector) => isConfiguredLegacyWhatsappChannel(
          sector,
          process.env.WHATSAPP_ACCESS_TOKEN,
        ))
        .map((sector) => ({
          id: `legacy:${sector.id}`,
          setor_id: sector.id,
          phone_number_id: sector.phone_number_id,
          whatsapp_token: sector.whatsapp_token,
        }))
      const currentLegacyChannels = configuredLegacyChannels.filter(
        (channel) => channel.setor_id === ticketContext.setor_id,
      )

      legacyChannel = selectAuthorizedTicketChannel({
        currentActiveChannels: currentLegacyChannels,
        matchingActiveChannels: configuredLegacyChannels,
        historicalEvidence,
        requestedIdentifier: requestedPhoneNumberId,
        getIdentifier: (channel) => channel.phone_number_id,
        getOwnerId: (channel) => channel.setor_id,
        resolveOwnerId: resolveSharedChannelOwnerId,
      })
    }

    if (requestedPhoneNumberId && !modernChannel && !legacyChannel) {
      const error = 'O canal informado não pertence ao setor atual do ticket'
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

    const accessToken =
      modernChannel?.whatsapp_token
      || (modernChannel ? process.env.WHATSAPP_ACCESS_TOKEN : null)
      || legacyChannel?.whatsapp_token
      || (legacyChannel ? process.env.WHATSAPP_ACCESS_TOKEN : null)
    const senderPhoneNumberId =
      modernChannel?.phone_number_id
      || legacyChannel?.phone_number_id

    if (!accessToken || !senderPhoneNumberId) {
      const error = 'WhatsApp credentials not configured'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error,
          code: 'CHANNEL_NOT_CONFIGURED',
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: 500 }
      )
    }

    const ticketClient = Array.isArray(ticketContext.clientes)
      ? ticketContext.clientes[0]
      : ticketContext.clientes
    const persistedRecipient = resolvePersistedRecipient(
      ticketClient?.telefone,
      persistedMessage ? null : recipientPhone,
    )

    if (!persistedRecipient.ok) {
      const persistenceFailure = await persistFailure(
        serviceClient,
        sendAttempt,
        persistedRecipient.error,
      )
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error: persistedRecipient.error,
          code: persistedRecipient.code,
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: 422 },
      )
    }

    const formattedPhone = persistedRecipient.phone

    // Build message payload based on type (image, document, or text)
    let messagePayload: Record<string, unknown>

    if (mediaUrl) {
      const isImage = mediaType?.startsWith('image/')
      const isAudio = mediaType?.startsWith('audio/')
      const isVideo = mediaType?.startsWith('video/')

      // Default document filename: explicit fileName > URL basename > generic.
      const documentFilename =
        requestedFileName ||
        (mediaUrl ? mediaUrl.split('/').pop()?.split('?')[0] : null) ||
        'arquivo'

      if (isImage) {
        // Send image message
        messagePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'image',
          image: {
            link: mediaUrl,
            caption: sendMessage || undefined,
          },
        }
      } else if (isAudio) {
        // Send audio message (renders as voice note when ogg/opus or aac)
        messagePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'audio',
          audio: { link: mediaUrl },
        }
      } else if (isVideo) {
        // Send video message (mp4 with H.264 + AAC only — checked by whitelist above)
        messagePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'video',
          video: {
            link: mediaUrl,
            caption: sendMessage || undefined,
          },
        }
      } else {
        // Document branch — covers PDF, Word, Excel, PowerPoint, TXT.
        // Anything outside that list was already rejected by the whitelist above.
        messagePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'document',
          document: {
            link: mediaUrl,
            caption: sendMessage || undefined,
            filename: documentFilename,
          },
        }
      }
    } else {
      // Send text message
      messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: sendMessage,
        },
      }
    }

    // Attach quoted-reply context. Meta renders the original message above ours
    // for both sides of the conversation when context.message_id is supplied.
    if (replyContextWamid) {
      messagePayload.context = { message_id: replyContextWamid }
    }

    const whatsappUrl = `${WHATSAPP_API_URL}/${senderPhoneNumberId}/messages`

    const latestAuthorization = await authorizeTicketSend(supabase, ticketId, user.email)
    if (
      !latestAuthorization.ok
      || latestAuthorization.ticket.setor_id !== ticketContext.setor_id
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

    // Send message via WhatsApp Cloud API
    providerRequestStarted = true
    const whatsappResponse = await fetch(whatsappUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    })

    const whatsappData = await whatsappResponse.json()

    if (!whatsappResponse.ok) {
      console.error('[WhatsApp Send] Provider error status:', whatsappResponse.status)
      const error = whatsappData?.error?.message || 'Falha ao enviar mensagem via WhatsApp'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error: 'Failed to send WhatsApp message',
          code: 'PROVIDER_SEND_FAILED',
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: whatsappResponse.status }
      )
    }

    const providerMessageId = whatsappData.messages?.[0]?.id
    if (!providerMessageId) {
      throw new Error('WhatsApp não retornou o identificador da mensagem')
    }

    let savedMessage = null

    // If messageId was provided, update the existing message with WhatsApp ID
    if (messageId && legacyPersistedMessage) {
      const completion = await completeLegacyPersistedMessageSend(
        serviceClient!,
        ticketId,
        messageId,
        providerMessageId,
        senderPhoneNumberId,
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
        providerMessageId,
        phoneNumberId: senderPhoneNumberId,
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
      // Compatibility for automatic closure messages that are not pre-persisted.
      const mtLower = (mediaType || '').toLowerCase()
      const messageType = mtLower.startsWith('image/') ? 'imagem'
        : mtLower.startsWith('audio/') ? 'audio'
        : mtLower.startsWith('video/') ? 'video'
        : mediaUrl ? 'documento'
        : 'texto'
      serviceClient ||= createServiceClient()
      const persistence = await persistAcceptedLegacyMessage(serviceClient, {
        ticketId,
        clientId: ticketContext.cliente_id,
        content: sendMessage || '',
        type: messageType,
        phoneNumberId: senderPhoneNumberId,
        providerMessageId,
        fileUrl: mediaUrl,
        mediaType,
        channel: 'whatsapp',
        replyToMessageId: effectiveReplyToMessageId,
      })

      if (!persistence.ok) {
        console.error('[WhatsApp Send] Falha ao persistir mensagem aceita')
        // Message was sent but not saved - still return success but warn
        return NextResponse.json({
          success: true,
          warning: 'Message sent but failed to save to database',
          providerAccepted: true,
          whatsappMessageId: providerMessageId,
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

    return NextResponse.json({
      success: true,
      message: savedMessage,
      status_envio: messageId && !legacyPersistedMessage ? 'enviado' : undefined,
      legacy: legacyPersistedMessage || undefined,
      whatsappMessageId: providerMessageId,
    })
  } catch (error) {
    console.error('[WhatsApp Send] Falha interna de envio')
    if (serviceClient && sendAttempt) {
      const status = providerRequestStarted ? 'indeterminado' : 'falhou'
      const completion = await completePersistedMessageSend(serviceClient, sendAttempt, {
        status,
        error: error instanceof Error ? error.message : 'Erro interno no envio',
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
      { status: 500 }
    )
  }
}
