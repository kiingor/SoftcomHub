import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

let configured = false

function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:suporte@softcomtecnologia.com'
  if (!publicKey || !privateKey) {
    throw new Error('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas')
  }
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PUBLIC_KEY !== publicKey) {
    throw new Error('[push] VAPID_PUBLIC_KEY e NEXT_PUBLIC_VAPID_PUBLIC_KEY precisam ser iguais')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
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

  return { sent, failed }
}
