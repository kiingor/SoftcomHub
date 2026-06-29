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
      .select('id')
      .eq('email', user.email)
      .single()
    if (!colaborador) {
      return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const sub = body?.subscription
    const endpoint: string | undefined = sub?.endpoint
    const p256dh: string | undefined = sub?.keys?.p256dh
    const authKey: string | undefined = sub?.keys?.auth
    if (!endpoint || !p256dh || !authKey) {
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
