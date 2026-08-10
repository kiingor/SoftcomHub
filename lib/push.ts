import { createECDH } from 'node:crypto'
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

let configured = false

const DEFAULT_VAPID_SUBJECT = 'mailto:suporte@softcomtecnologia.com'

interface VapidConfiguration {
  publicKey: string
  privateKey: string
  subject: string
}

interface VapidConfigurationError {
  error: string
}

function environmentValue(name: string) {
  return process.env[name]?.trim() || undefined
}

function matchesVapidKeyPair(publicKey: string, privateKey: string) {
  try {
    const curve = createECDH('prime256v1')
    curve.setPrivateKey(Buffer.from(privateKey, 'base64url'))
    return curve.getPublicKey(undefined, 'uncompressed').toString('base64url') === publicKey
  } catch {
    return false
  }
}

export function getVapidConfiguration(): VapidConfiguration | VapidConfigurationError {
  const serverPublicKey = environmentValue('VAPID_PUBLIC_KEY')
  const clientPublicKey = environmentValue('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
  const privateKey = environmentValue('VAPID_PRIVATE_KEY')
  const publicKey = serverPublicKey || clientPublicKey

  if (!publicKey || !privateKey) {
    return { error: 'As notificações não foram configuradas neste ambiente.' }
  }

  if (serverPublicKey && clientPublicKey && serverPublicKey !== clientPublicKey) {
    return { error: 'A configuração de notificações está inconsistente.' }
  }

  if (!matchesVapidKeyPair(publicKey, privateKey)) {
    return { error: 'As chaves VAPID não correspondem. Gere e configure um único par de chaves.' }
  }

  return {
    publicKey,
    privateKey,
    subject: environmentValue('VAPID_SUBJECT') || DEFAULT_VAPID_SUBJECT,
  }
}

function ensureConfigured() {
  if (configured) return
  const configuration = getVapidConfiguration()
  if ('error' in configuration) {
    throw new Error(`[push] ${configuration.error}`)
  }
  webpush.setVapidDetails(
    configuration.subject,
    configuration.publicKey,
    configuration.privateKey,
  )
  configured = true
}

export interface PushPayload {
  title: string
  body: string
  /** Rota aberta ao clicar na notificação (ex: /setor/<id>) */
  url?: string
  /** Agrupa/colapsa notificações repetidas do mesmo recurso */
  tag?: string
  /** Categoria — o service worker usa para decidir comportamento (ex: suprimir
   *  notificação de mensagem quando o WorkDesk já está em foco). */
  type?: 'instancia' | 'mensagem'
}

interface SubRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface PushDeliveryFailure {
  statusCode: number | null
  message: string
}

function getPushDeliveryFailure(error: unknown): PushDeliveryFailure {
  const statusCode =
    typeof (error as { statusCode?: unknown })?.statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : null
  const message = error instanceof Error ? error.message : 'Erro desconhecido'

  return { statusCode, message: message.slice(0, 500) }
}

/**
 * Envia uma notificação web push para todos os colaboradores informados.
 * Busca as subscriptions desses colaboradores, dispara em paralelo e remove
 * as inválidas (404/410 = subscription expirada/cancelada).
 */
export async function sendPushToColaboradores(
  service: SupabaseClient,
  colaboradorIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (colaboradorIds.length === 0) return { sent: 0, failed: 0 }
  ensureConfigured()

  const { data: subs, error: subscriptionsError } = await service
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('colaborador_id', colaboradorIds)

  if (subscriptionsError) throw subscriptionsError

  if (!subs || subs.length === 0) return { sent: 0, failed: 0 }

  const body = JSON.stringify(payload)
  const deadIds: string[] = []
  const failures: PushDeliveryFailure[] = []
  let sent = 0
  let failed = 0

  await Promise.all(
    (subs as SubRow[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        )
        sent++
      } catch (err: unknown) {
        failed++
        failures.push(getPushDeliveryFailure(err))
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) deadIds.push(s.id)
      }
    }),
  )

  if (deadIds.length > 0) {
    const { error: cleanupError } = await service
      .from('push_subscriptions')
      .delete()
      .in('id', deadIds)
    if (cleanupError) console.error('[push] Falha ao limpar subscriptions expiradas:', cleanupError)
  }

  if (failures.length > 0) {
    console.error('[push] Falha ao entregar notificações:', {
      failures,
      total: failures.length,
    })
  }

  return { sent, failed }
}
