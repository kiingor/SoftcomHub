import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/service'

const USERS_PER_PAGE = 1000

/**
 * O admin API nao tem busca por e-mail: so listUsers paginado. Pedir uma pagina
 * unica de 1000 parece bastar hoje, mas some silenciosamente com quem estiver
 * alem desse teto — o mesmo laco de paginas do master-login resolve.
 */
async function findAuthUserIdByEmail(
  service: SupabaseClient,
  normalizedEmail: string,
): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    })

    if (error) throw error
    if (!data) return null

    const found = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail)
    if (found) return found.id

    if (data.users.length < USERS_PER_PAGE) return null
  }
}

/**
 * POST /api/admin/update-user-password
 *
 * Define a senha de um colaborador sem passar por e-mail de recuperacao.
 * Restrito a quem administra usuarios — ver requireAdmin().
 */
export async function POST(request: Request) {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    const body = await request.json()
    const { email, newPassword } = body

    if (!email || !newPassword) {
      return NextResponse.json({ error: 'Email e nova senha são obrigatórios' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'A senha deve ter no mínimo 6 caracteres' }, { status: 400 })
    }

    const service = createServiceClient()
    const normalizedEmail = email.trim().toLowerCase()
    const userId = await findAuthUserIdByEmail(service, normalizedEmail)

    if (!userId) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const { error: updateError } = await service.auth.admin.updateUserById(userId, {
      password: newPassword,
    })

    if (updateError) {
      console.error('[UpdateUserPassword] Update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    console.info(
      `[UpdateUserPassword] ${guard.colaborador.email} redefiniu a senha de ${normalizedEmail}`,
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[UpdateUserPassword] Error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
