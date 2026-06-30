import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/push/unsubscribe
 * Remove a subscription (por endpoint) do colaborador logado.
 * Body: { endpoint: string }
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

    const body = await request.json()
    const endpoint: string | undefined = body?.endpoint
    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint obrigatório' }, { status: 400 })
    }

    const service = createServiceClient()
    await service.from('push_subscriptions').delete().eq('endpoint', endpoint)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[push/unsubscribe]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
