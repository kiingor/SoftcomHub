import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const serverPublicKey = process.env.VAPID_PUBLIC_KEY
  const clientPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const publicKey = serverPublicKey || clientPublicKey

  if (!publicKey || !privateKey) {
    return NextResponse.json(
      { error: 'As notificações não foram configuradas neste ambiente.' },
      { status: 503 },
    )
  }

  if (serverPublicKey && clientPublicKey && serverPublicKey !== clientPublicKey) {
    return NextResponse.json(
      { error: 'A configuração de notificações está inconsistente.' },
      { status: 503 },
    )
  }

  return NextResponse.json({ publicKey })
}
