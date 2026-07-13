import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/push/subscribe
 * Salva (upsert por endpoint) a Web Push subscription do colaborador logado.
 * Body: { subscription: PushSubscriptionJSON }
 */
export async function POST(request: Request) {
  try {
    const auth = await createClient()
    const {
      data: { user },
    } = await auth.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const service = createServiceClient()
    const { data: colaborador } = await service
      .from('colaboradores')
      .select('id, ativo')
      .eq('email', user.email)
      .single()
    if (!colaborador) {
      return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 })
    }
    if (!colaborador.ativo) {
      return NextResponse.json({ error: 'Colaborador inativo' }, { status: 403 })
    }

    const body = await request.json()
    const sub = body?.subscription
    const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : undefined
    const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : undefined
    const authKey = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : undefined
    let endpointUrl: URL | null = null
    try {
      endpointUrl = endpoint ? new URL(endpoint) : null
    } catch {
      endpointUrl = null
    }
    if (
      !endpoint ||
      !p256dh ||
      !authKey ||
      endpointUrl?.protocol !== 'https:' ||
      endpoint.length > 4096 ||
      p256dh.length > 1024 ||
      authKey.length > 1024
    ) {
      return NextResponse.json({ error: 'Subscription inválida' }, { status: 400 })
    }

    const { error } = await service.from('push_subscriptions').upsert(
      {
        colaborador_id: colaborador.id,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: request.headers.get('user-agent'),
      },
      { onConflict: 'endpoint' },
    )
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[push/subscribe]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
