import type { SupabaseClient } from '@supabase/supabase-js'

export type PersistedMessageSendStatus =
  | 'pendente'
  | 'enviando'
  | 'enviado'
  | 'falhou'
  | 'indeterminado'

export interface MessageSendAttempt {
  messageId: string
  ticketId: string
  attemptId: string
  message: PersistedMessagePayload
}

export interface PersistedMessagePayload {
  content: string
  type: string
  fileUrl: string | null
  mediaType: string | null
  phoneNumberId: string | null
  replyToMessageId: string | null
}

export interface AcceptedLegacyMessage {
  ticketId: string
  clientId?: string | null
  content: string
  type: string
  fileUrl?: string | null
  mediaType?: string | null
  phoneNumberId?: string | null
  channel: string
  replyToMessageId?: string | null
  providerMessageId: string | null
}

export type AcceptedLegacyMessageResult =
  | { ok: true; message: Record<string, unknown>; schemaFallback: boolean }
  | { ok: false; code: 'MESSAGE_STATUS_PERSIST_FAILED'; error: string }

export type MessageSendClaimResult =
  | { ok: true; kind: 'claimed'; attempt: MessageSendAttempt }
  | {
      ok: true
      kind: 'already_sent'
      providerMessageId: string | null
      status_envio: 'enviado'
    }
  | {
      ok: false
      status: number
      code: string
      error: string
      status_envio?: PersistedMessageSendStatus | null
    }

export type MessageSendFinalStatus = 'enviado' | 'falhou' | 'indeterminado'

export interface MessageSendCompletion {
  status: MessageSendFinalStatus
  error?: string | null
  providerMessageId?: string | null
  phoneNumberId?: string | null
}

export type MessageSendCompletionResult =
  | { ok: true; status_envio: MessageSendFinalStatus }
  | { ok: false; code: 'MESSAGE_STATUS_PERSIST_FAILED'; error: string }

export type MessageSendReconcileResult =
  | {
      ok: true
      changed: boolean
      status_envio: PersistedMessageSendStatus
    }
  | {
      ok: false
      status: number
      code: string
      error: string
      status_envio?: PersistedMessageSendStatus | null
    }

export type LegacyPersistedMessageResult =
  | {
      ok: true
      message: PersistedMessagePayload
      providerMessageId: string | null
    }
  | {
      ok: false
      status: number
      code: string
      error: string
    }

type DatabaseClient = Pick<SupabaseClient, 'from'>

export const SEND_CLAIM_STALE_MS = 10 * 60 * 1000
const LEGACY_MESSAGE_MAX_AGE_MS = 5 * 60 * 1000

function normalizePersistenceError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'Falha desconhecida ao persistir o envio'
}

function isSendStatusSchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code) : ''
  return code === '42703' || code === 'PGRST204'
}

function toPersistedMessagePayload(row: Record<string, unknown>): PersistedMessagePayload {
  return {
    content: typeof row.conteudo === 'string' ? row.conteudo : '',
    type: typeof row.tipo === 'string' ? row.tipo : 'texto',
    fileUrl: typeof row.url_imagem === 'string' ? row.url_imagem : null,
    mediaType: typeof row.media_type === 'string' ? row.media_type : null,
    phoneNumberId: typeof row.phone_number_id === 'string' ? row.phone_number_id : null,
    replyToMessageId: typeof row.reply_to_message_id === 'string'
      ? row.reply_to_message_id
      : null,
  }
}

/**
 * The idempotency guarantee applies to persisted collaborator messages.
 * Legacy automatic messages without messageId do not use this claim.
 */
export async function claimPersistedMessageSend(
  supabase: DatabaseClient,
  ticketId: string,
  messageId: string,
  isRetry = false,
): Promise<MessageSendClaimResult> {
  const attemptId = crypto.randomUUID()
  const attemptedAt = new Date().toISOString()
  const claimUpdate = {
    status_envio: 'enviando',
    erro_envio: null,
    envio_tentativa_id: attemptId,
    envio_tentativa_em: attemptedAt,
  }
  const claimableStatuses: PersistedMessageSendStatus[] = isRetry
    ? ['falhou', 'indeterminado']
    : ['pendente']
  let { data: claimed, error: claimError } = await supabase
    .from('mensagens')
    .update(claimUpdate)
    .eq('id', messageId)
    .eq('ticket_id', ticketId)
    .eq('remetente', 'colaborador')
    .is('whatsapp_message_id', null)
    .in('status_envio', claimableStatuses)
    .select(
      'id, conteudo, tipo, url_imagem, media_type, phone_number_id, reply_to_message_id',
    )
    .maybeSingle()

  if (!claimError && !claimed && !isRetry) {
    const createdSince = new Date(
      Date.now() - LEGACY_MESSAGE_MAX_AGE_MS,
    ).toISOString()
    ;({ data: claimed, error: claimError } = await supabase
      .from('mensagens')
      .update(claimUpdate)
      .eq('id', messageId)
      .eq('ticket_id', ticketId)
      .eq('remetente', 'colaborador')
      .is('whatsapp_message_id', null)
      .is('status_envio', null)
      .gte('enviado_em', createdSince)
      .select(
        'id, conteudo, tipo, url_imagem, media_type, phone_number_id, reply_to_message_id',
      )
      .maybeSingle())
  }

  if (claimError) {
    if (isSendStatusSchemaUnavailable(claimError)) {
      return {
        ok: false,
        status: 503,
        code: 'SEND_STATUS_SCHEMA_UNAVAILABLE',
        error: 'O controle seguro de envio ainda não está disponível neste ambiente',
      }
    }
    return {
      ok: false,
      status: 500,
      code: 'MESSAGE_CLAIM_FAILED',
      error: 'Não foi possível reservar a mensagem para envio',
    }
  }
  if (claimed) {
    return {
      ok: true,
      kind: 'claimed',
      attempt: {
        messageId,
        ticketId,
        attemptId,
        message: toPersistedMessagePayload(claimed),
      },
    }
  }

  const { data: existing, error: lookupError } = await supabase
    .from('mensagens')
    .select('ticket_id, remetente, status_envio, whatsapp_message_id')
    .eq('id', messageId)
    .maybeSingle()

  if (lookupError) {
    return {
      ok: false,
      status: 500,
      code: 'MESSAGE_CLAIM_FAILED',
      error: 'Não foi possível validar a mensagem para envio',
    }
  }
  if (!existing || existing.ticket_id !== ticketId || existing.remetente !== 'colaborador') {
    return {
      ok: false,
      status: 404,
      code: 'MESSAGE_NOT_FOUND',
      error: 'Mensagem não encontrada neste ticket',
    }
  }
  if (existing.status_envio === 'enviado' || existing.whatsapp_message_id) {
    if (existing.status_envio !== 'enviado' && existing.whatsapp_message_id) {
      const { error: normalizeError } = await supabase
        .from('mensagens')
        .update({
          status_envio: 'enviado',
          erro_envio: null,
          envio_tentativa_id: null,
          envio_tentativa_em: null,
        })
        .eq('id', messageId)
        .eq('ticket_id', ticketId)
        .eq('remetente', 'colaborador')
        .eq('whatsapp_message_id', existing.whatsapp_message_id)
        .select('id')
        .maybeSingle()

      if (normalizeError) {
        return {
          ok: false,
          status: 500,
          code: 'MESSAGE_STATUS_PERSIST_FAILED',
          error: 'Não foi possível normalizar o estado da mensagem enviada',
        }
      }
    }
    return {
      ok: true,
      kind: 'already_sent',
      providerMessageId: existing.whatsapp_message_id || null,
      status_envio: 'enviado',
    }
  }
  if (existing.status_envio === 'enviando') {
    return {
      ok: false,
      status: 409,
      code: 'MESSAGE_SEND_IN_PROGRESS',
      error: 'Esta mensagem já está sendo enviada',
      status_envio: 'enviando',
    }
  }

  return {
    ok: false,
    status: 409,
    code: 'MESSAGE_NOT_RETRYABLE',
    error: 'O estado atual da mensagem não permite o envio',
    status_envio: existing.status_envio,
  }
}

export async function completePersistedMessageSend(
  supabase: DatabaseClient,
  attempt: MessageSendAttempt,
  completion: MessageSendCompletion,
): Promise<MessageSendCompletionResult> {
  const update: Record<string, unknown> = {
    status_envio: completion.status,
    erro_envio: completion.error?.slice(0, 2000) || null,
    envio_tentativa_id: null,
    envio_tentativa_em: null,
  }

  if (completion.status === 'enviado') {
    if (completion.providerMessageId) {
      update.whatsapp_message_id = completion.providerMessageId
    }
    if (completion.phoneNumberId) {
      update.phone_number_id = completion.phoneNumberId
    }
  }

  const { data, error } = await supabase
    .from('mensagens')
    .update(update)
    .eq('id', attempt.messageId)
    .eq('ticket_id', attempt.ticketId)
    .eq('remetente', 'colaborador')
    .eq('status_envio', 'enviando')
    .eq('envio_tentativa_id', attempt.attemptId)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    return {
      ok: false,
      code: 'MESSAGE_STATUS_PERSIST_FAILED',
      error: normalizePersistenceError(error),
    }
  }

  return { ok: true, status_envio: completion.status }
}

export async function loadLegacyPersistedMessageSend(
  supabase: DatabaseClient,
  ticketId: string,
  messageId: string,
): Promise<LegacyPersistedMessageResult> {
  const createdSince = new Date(Date.now() - LEGACY_MESSAGE_MAX_AGE_MS).toISOString()
  const { data, error } = await supabase
    .from('mensagens')
    .select(
      'conteudo, tipo, url_imagem, media_type, phone_number_id, reply_to_message_id, whatsapp_message_id',
    )
    .eq('id', messageId)
    .eq('ticket_id', ticketId)
    .eq('remetente', 'colaborador')
    .gte('enviado_em', createdSince)
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'LEGACY_MESSAGE_LOOKUP_FAILED',
      error: 'Não foi possível validar a mensagem no modo de compatibilidade',
    }
  }
  if (!data) {
    return {
      ok: false,
      status: 404,
      code: 'MESSAGE_NOT_FOUND',
      error: 'Mensagem recente não encontrada neste ticket',
    }
  }

  return {
    ok: true,
    message: toPersistedMessagePayload(data),
    providerMessageId: data.whatsapp_message_id || null,
  }
}

export async function completeLegacyPersistedMessageSend(
  supabase: DatabaseClient,
  ticketId: string,
  messageId: string,
  providerMessageId: string | null,
  phoneNumberId?: string | null,
): Promise<MessageSendCompletionResult> {
  const update: Record<string, unknown> = {}
  if (providerMessageId) update.whatsapp_message_id = providerMessageId
  if (phoneNumberId) update.phone_number_id = phoneNumberId
  if (Object.keys(update).length === 0) {
    return { ok: true, status_envio: 'enviado' }
  }

  const createdSince = new Date(Date.now() - LEGACY_MESSAGE_MAX_AGE_MS).toISOString()
  const { data, error } = await supabase
    .from('mensagens')
    .update(update)
    .eq('id', messageId)
    .eq('ticket_id', ticketId)
    .eq('remetente', 'colaborador')
    .gte('enviado_em', createdSince)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    return {
      ok: false,
      code: 'MESSAGE_STATUS_PERSIST_FAILED',
      error: normalizePersistenceError(error),
    }
  }

  return { ok: true, status_envio: 'enviado' }
}

/**
 * Compatibility path for automatic messages whose legacy callers do not
 * persist a row before contacting the provider. This must receive a service
 * client so an accepted provider response is never normalized back to
 * `pendente` by the authenticated INSERT trigger.
 */
export async function persistAcceptedLegacyMessage(
  supabase: DatabaseClient,
  message: AcceptedLegacyMessage,
): Promise<AcceptedLegacyMessageResult> {
  const basePayload = {
    ticket_id: message.ticketId,
    cliente_id: message.clientId || null,
    remetente: 'colaborador',
    conteudo: message.content,
    tipo: message.type,
    url_imagem: message.fileUrl || null,
    media_type: message.mediaType || null,
    phone_number_id: message.phoneNumberId || null,
    canal_envio: message.channel,
    reply_to_message_id: message.replyToMessageId || null,
    whatsapp_message_id: message.providerMessageId,
  }

  let { data, error } = await supabase
    .from('mensagens')
    .insert({ ...basePayload, status_envio: 'enviado' })
    .select()
    .single()
  let schemaFallback = false

  if (error && isSendStatusSchemaUnavailable(error)) {
    schemaFallback = true
    ;({ data, error } = await supabase
      .from('mensagens')
      .insert(basePayload)
      .select()
      .single())
  }

  if (error || !data) {
    return {
      ok: false,
      code: 'MESSAGE_STATUS_PERSIST_FAILED',
      error: normalizePersistenceError(error),
    }
  }

  return {
    ok: true,
    message: data as Record<string, unknown>,
    schemaFallback,
  }
}

export async function reconcilePendingMessageSend(
  supabase: DatabaseClient,
  ticketId: string,
  messageId: string,
): Promise<MessageSendReconcileResult> {
  const { data: changed, error: updateError } = await supabase
    .from('mensagens')
    .update({
      status_envio: 'indeterminado',
      erro_envio: 'A solicitação de envio não chegou a confirmar o processamento',
      envio_tentativa_id: null,
      envio_tentativa_em: null,
    })
    .eq('id', messageId)
    .eq('ticket_id', ticketId)
    .eq('remetente', 'colaborador')
    .eq('status_envio', 'pendente')
    .is('whatsapp_message_id', null)
    .select('id, status_envio')
    .maybeSingle()

  if (updateError) {
    return {
      ok: false,
      status: 500,
      code: 'MESSAGE_STATUS_PERSIST_FAILED',
      error: 'Não foi possível reconciliar o estado da mensagem',
    }
  }
  if (changed) {
    return { ok: true, changed: true, status_envio: 'indeterminado' }
  }

  const { data: existing, error: lookupError } = await supabase
    .from('mensagens')
    .select(
      'ticket_id, remetente, status_envio, envio_tentativa_id, envio_tentativa_em, whatsapp_message_id',
    )
    .eq('id', messageId)
    .maybeSingle()

  if (lookupError) {
    return {
      ok: false,
      status: 500,
      code: 'MESSAGE_STATUS_LOOKUP_FAILED',
      error: 'Não foi possível consultar o estado da mensagem',
    }
  }
  if (!existing || existing.ticket_id !== ticketId || existing.remetente !== 'colaborador') {
    return {
      ok: false,
      status: 404,
      code: 'MESSAGE_NOT_FOUND',
      error: 'Mensagem não encontrada neste ticket',
    }
  }

  const status = existing.status_envio as PersistedMessageSendStatus | null
  if (existing.whatsapp_message_id) {
    const { error: normalizeError } = await supabase
      .from('mensagens')
      .update({
        status_envio: 'enviado',
        erro_envio: null,
        envio_tentativa_id: null,
        envio_tentativa_em: null,
      })
      .eq('id', messageId)
      .eq('ticket_id', ticketId)
      .eq('remetente', 'colaborador')
      .eq('whatsapp_message_id', existing.whatsapp_message_id)
      .select('id')
      .maybeSingle()

    if (normalizeError) {
      return {
        ok: false,
        status: 500,
        code: 'MESSAGE_STATUS_PERSIST_FAILED',
        error: 'Não foi possível normalizar o estado da mensagem enviada',
      }
    }
    return {
      ok: true,
      changed: status !== 'enviado',
      status_envio: 'enviado',
    }
  }

  if (!status) {
    return {
      ok: false,
      status: 409,
      code: 'MESSAGE_STATUS_UNAVAILABLE',
      error: 'A mensagem ainda não possui estado de envio controlado',
      status_envio: null,
    }
  }

  const claimTimestamp = typeof existing.envio_tentativa_em === 'string'
    ? Date.parse(existing.envio_tentativa_em)
    : Number.NaN
  const hasValidClaimMetadata = Boolean(
    existing.envio_tentativa_id
    && existing.envio_tentativa_em
    && Number.isFinite(claimTimestamp),
  )

  if (status === 'enviando' && !hasValidClaimMetadata) {
    let orphanQuery = supabase
      .from('mensagens')
      .update({
        status_envio: 'indeterminado',
        erro_envio: 'O envio estava sem metadados vÃ¡lidos de processamento',
        envio_tentativa_id: null,
        envio_tentativa_em: null,
      })
      .eq('id', messageId)
      .eq('ticket_id', ticketId)
      .eq('remetente', 'colaborador')
      .eq('status_envio', 'enviando')
      .is('whatsapp_message_id', null)

    orphanQuery = existing.envio_tentativa_id
      ? orphanQuery.eq('envio_tentativa_id', existing.envio_tentativa_id)
      : orphanQuery.is('envio_tentativa_id', null)
    orphanQuery = existing.envio_tentativa_em
      ? orphanQuery.eq('envio_tentativa_em', existing.envio_tentativa_em)
      : orphanQuery.is('envio_tentativa_em', null)

    const { data: reconciled, error: reconcileError } = await orphanQuery
      .select('id')
      .maybeSingle()

    if (reconcileError) {
      return {
        ok: false,
        status: 500,
        code: 'MESSAGE_STATUS_PERSIST_FAILED',
        error: 'NÃ£o foi possÃ­vel reconciliar o claim sem metadados',
      }
    }
    if (reconciled) {
      return { ok: true, changed: true, status_envio: 'indeterminado' }
    }
  }

  if (
    status === 'enviando'
    && hasValidClaimMetadata
  ) {
    const staleBefore = new Date(Date.now() - SEND_CLAIM_STALE_MS).toISOString()
    if (claimTimestamp < Date.parse(staleBefore)) {
      const { data: reconciled, error: reconcileError } = await supabase
        .from('mensagens')
        .update({
          status_envio: 'indeterminado',
          erro_envio: 'O processo de envio foi interrompido antes da confirmação',
          envio_tentativa_id: null,
          envio_tentativa_em: null,
        })
        .eq('id', messageId)
        .eq('ticket_id', ticketId)
        .eq('remetente', 'colaborador')
        .eq('status_envio', 'enviando')
        .eq('envio_tentativa_id', existing.envio_tentativa_id)
        .lt('envio_tentativa_em', staleBefore)
        .select('id')
        .maybeSingle()

      if (reconcileError) {
        return {
          ok: false,
          status: 500,
          code: 'MESSAGE_STATUS_PERSIST_FAILED',
          error: 'Não foi possível reconciliar o claim interrompido',
        }
      }
      if (reconciled) {
        return { ok: true, changed: true, status_envio: 'indeterminado' }
      }
    }
  }

  return { ok: true, changed: false, status_envio: status }
}
