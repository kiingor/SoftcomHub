import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, newPassword } = body

    if (!email || !newPassword) {
      return NextResponse.json({ error: 'Email e nova senha são obrigatórios' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'A senha deve ter no mínimo 6 caracteres' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const normalizedEmail = email.trim().toLowerCase()

    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (listError) {
      console.error('[UpdateUserPassword] List users error:', listError)
      return NextResponse.json({ error: listError.message }, { status: 400 })
    }

    const user = listData.users.find((u) => u.email?.toLowerCase() === normalizedEmail)

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })

    if (updateError) {
      console.error('[UpdateUserPassword] Update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[UpdateUserPassword] Error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
