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
  readResponseBodyWithLimit,
  validateOutboundMediaUrl,
} from '@/lib/message-send-target'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { authorizeTicketSend } from '@/lib/ticket-send-auth'

const DISCORD_API_URL = 'https://discord.com/api/v10'
const MAX_DISCORD_MEDIA_BYTES = 25 * 1024 * 1024
const requestSchema = z.object({
  ticketId: z.string().uuid(),
  message: z.string().max(20_000).nullish(),
  messageId: z.string().uuid().nullish(),
  fileUrl: z.string().max(4_096).nullish(),
  fileType: z.string().max(255).nullish(),
  fileName: z.string().max(512).nullish(),
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
    if (retry === true && !messageId) {
      return NextResponse.json(
        { error: 'Retry exige uma mensagem persistida', code: 'RETRY_REQUIRES_MESSAGE_ID' },
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

    let replyProviderMessageId: string | null = null
    if (effectiveReplyToMessageId) {
      const { data: parent, error: parentError } = await authoritativeClient
        .from('mensagens')
        .select('whatsapp_message_id')
        .eq('id', effectiveReplyToMessageId)
        .eq('ticket_id', ticketId)
        .in('remetente', [...REPLYABLE_TICKET_SENDERS])
        .maybeSingle()

      if (parentError || !parent?.whatsapp_message_id) {
        const error = 'A mensagem respondida não pertence a este ticket ou não pode ser citada'
        const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
        if (persistenceFailure) return persistenceFailure
        sendAttempt = null
        return NextResponse.json(
          {
            error,
            code: 'REPLY_MESSAGE_INVALID',
            status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
          },
          { status: 422 },
        )
      }
      replyProviderMessageId = parent.whatsapp_message_id
    }

    // Get ticket to find setor
    const { data: ticket, error: ticketError } = await authoritativeClient
      .from('tickets')
      .select('setor_id, cliente_id')
      .eq('id', ticketId)
      .single()

    if (ticketError || !ticket?.setor_id) {
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

    // Get Discord credentials - Priority: setor_canais > setores
    let discordBotToken: string | null = null
    let guildId: string | null = null

    // Priority 1: Check setor_canais for discord channel (mais recente primeiro)
    const { data: todosCanaisDiscord, error: canaisDiscordError } = await authoritativeClient
      .from('setor_canais')
      .select('id, discord_bot_token, discord_guild_id, ativo, nome, criado_em')
      .eq('setor_id', ticket.setor_id)
      .eq('tipo', 'discord')

    if (canaisDiscordError) {
      throw canaisDiscordError
    }

    const canalMatch = todosCanaisDiscord
      ?.filter(c => c.ativo && c.discord_bot_token)
      .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())[0] || null

    if (canalMatch?.discord_bot_token) {
      discordBotToken = canalMatch.discord_bot_token
      guildId = canalMatch.discord_guild_id
    }

    // Priority 2: Fallback to setores table
    if (!discordBotToken && (todosCanaisDiscord?.length || 0) === 0) {
      const { data: setor, error: setorError } = await authoritativeClient
        .from('setores')
        .select('discord_bot_token, discord_guild_id')
        .eq('id', ticket.setor_id)
        .single()

      if (setorError) {
        throw setorError
      }

      discordBotToken = setor?.discord_bot_token || null
      guildId = guildId || setor?.discord_guild_id || null
    }

    if (!discordBotToken) {
      const error = 'Discord bot token não configurado para este setor'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error: 'Discord bot token nao configurado para este setor',
          code: 'CHANNEL_NOT_CONFIGURED',
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: 400 },
      )
    }
    const botToken = discordBotToken

    // Get the discord_user_id from the client or from the last client message
    let discordUserId: string | null = null

    // First try from clientes table
    if (ticket.cliente_id) {
      const { data: cliente } = await authoritativeClient
        .from('clientes')
        .select('discord_user_id')
        .eq('id', ticket.cliente_id)
        .single()
      discordUserId = cliente?.discord_user_id || null
    }

    // Fallback: get from the last client message with discord_user_id
    if (!discordUserId) {
      const { data: lastMsg } = await authoritativeClient
        .from('mensagens')
        .select('discord_user_id')
        .eq('ticket_id', ticketId)
        .not('discord_user_id', 'is', null)
        .order('enviado_em', { ascending: false })
        .limit(1)
      discordUserId = lastMsg?.[0]?.discord_user_id || null
    }

    if (!discordUserId) {
      const errMsg = 'Discord User ID nao encontrado para este cliente. O cliente precisa enviar uma mensagem primeiro.'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, errMsg)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error: errMsg,
          code: 'RECIPIENT_NOT_FOUND',
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: 400 },
      )
    }

    // Step 1: Open a DM channel with the user
    const dmUrl = `${DISCORD_API_URL}/users/@me/channels`
    const dmBody = JSON.stringify({ recipient_id: discordUserId })

    const dmChannelResponse = await fetch(dmUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: dmBody,
    })

    const dmChannel = await dmChannelResponse.json().catch(() => null)

    if (!dmChannelResponse.ok || !dmChannel?.id) {
      console.error('[Discord Send] Falha ao abrir DM:', dmChannelResponse.status)
      const error = 'Erro ao abrir DM com o usuario no Discord'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error,
          code: 'PROVIDER_SEND_FAILED',
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: dmChannelResponse.status },
      )
    }

    // Step 2: Send message in the DM channel (with optional file attachment)
    const sendMsgUrl = `${DISCORD_API_URL}/channels/${dmChannel.id}/messages`
    let discordRequest: RequestInit

    if (mediaUrl) {
      // Download the file from the URL first
      const fileResponse = await fetch(mediaUrl, { redirect: 'error' })
      if (!fileResponse.ok) {
        const error = 'Erro ao baixar arquivo para envio'
        const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
        if (persistenceFailure) return persistenceFailure
        sendAttempt = null
        return NextResponse.json(
          {
            error,
            code: 'MEDIA_DOWNLOAD_FAILED',
            status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
          },
          { status: 500 },
        )
      }
      const fileBuffer = await readResponseBodyWithLimit(
        fileResponse,
        MAX_DISCORD_MEDIA_BYTES,
      )
      if (!fileBuffer) {
        const error = 'O arquivo excede o limite de 25 MB'
        const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
        if (persistenceFailure) return persistenceFailure
        sendAttempt = null
        return NextResponse.json(
          {
            error,
            code: 'MEDIA_TOO_LARGE',
            status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
          },
          { status: 413 },
        )
      }
      const resolvedFileName =
        mediaFileName
        || new URL(mediaUrl).pathname.split('/').pop()
        || 'arquivo'

      // Build multipart/form-data with the file
      const formData = new FormData()
      const payloadJson: Record<string, unknown> = {}
      if (sendMessage) {
        payloadJson.content = sendMessage
      }
      if (replyProviderMessageId) {
        payloadJson.message_reference = { message_id: replyProviderMessageId }
      }
      if (Object.keys(payloadJson).length > 0) {
        formData.append('payload_json', JSON.stringify(payloadJson))
      }
      formData.append(
        'files[0]',
        new Blob([fileBuffer], { type: mediaType || 'application/octet-stream' }),
        resolvedFileName,
      )

      discordRequest = {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
        },
        body: formData,
      }
    } else {
      const sendPayload: Record<string, unknown> = { content: sendMessage }
      if (replyProviderMessageId) {
        sendPayload.message_reference = { message_id: replyProviderMessageId }
      }
      discordRequest = {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sendPayload),
      }
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

    providerRequestStarted = true
    const discordResponse = await fetch(sendMsgUrl, discordRequest)
    const discordData = await discordResponse.json().catch(() => null)

    if (!discordResponse.ok) {
      console.error('[Discord Send] Falha do provider:', discordResponse.status)
      const error = 'Erro ao enviar mensagem no Discord'
      const persistenceFailure = await persistFailure(serviceClient, sendAttempt, error)
      if (persistenceFailure) return persistenceFailure
      sendAttempt = null
      return NextResponse.json(
        {
          error,
          code: 'PROVIDER_SEND_FAILED',
          status_envio: messageId && !legacyPersistedMessage ? 'falhou' : undefined,
        },
        { status: discordResponse.status },
      )
    }

    if (!discordData?.id) {
      throw new Error('Discord não retornou o identificador da mensagem')
    }

    let savedMessage: Record<string, unknown> | null = null
    if (messageId && legacyPersistedMessage) {
      const completion = await completeLegacyPersistedMessageSend(
        serviceClient!,
        ticketId,
        messageId,
        discordData.id,
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
        providerMessageId: discordData.id,
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
        channel: 'discord',
        replyToMessageId: effectiveReplyToMessageId,
        providerMessageId: discordData.id,
      })
      if (!persistence.ok) {
        return NextResponse.json({
          success: true,
          warning: 'Mensagem enviada, mas não foi possível salvar no histórico',
          providerAccepted: true,
          messageId: discordData.id,
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
      messageId: discordData.id,
      dmChannelId: dmChannel.id,
      guildId: guildId || null,
      status_envio: messageId && !legacyPersistedMessage ? 'enviado' : undefined,
      legacy: legacyPersistedMessage || undefined,
    })
  } catch (error) {
    console.error('[Discord Send] Falha interna de envio')
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
      { error: 'Erro interno ao enviar mensagem' },
      { status: 500 },
    )
  }
}
