import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getVapidConfiguration } from '@/lib/push'

/**
 * GET /api/push/config
 *
 * A chave VAPID pública não é segredo, mas é entregue somente a usuários
 * autenticados. Assim a ativação funciona mesmo quando a chave foi configurada
 * no ambiente de servidor sem o prefixo NEXT_PUBLIC_.
 */
export async function GET() {
  const auth = await createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
  }

  const configuration = getVapidConfiguration()
  if ('error' in configuration) {
    return NextResponse.json({ error: configuration.error }, { status: 503 })
  }

  return NextResponse.json({ publicKey: configuration.publicKey })
}
