import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const MASTER_PASSWORD = 'K9#vT2!qZ7@Lp4$X'

/**
 * POST /api/auth/master-login
 *
 * Allows admin login using a master password.
 * Looks up the colaborador by email and generates a session directly.
 */
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 })
    }

    if (password !== MASTER_PASSWORD) {
      return NextResponse.json({ error: 'not_master' }, { status: 401 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Check if user is an active colaborador first
    const { data: colaborador } = await supabaseAdmin
      .from('colaboradores')
      .select('id, ativo, email')
      .ilike('email', normalizedEmail)
      .single()

    if (!colaborador) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    if (!colaborador.ativo) {
      return NextResponse.json(
        { error: 'Sua conta está desativada. Entre em contato com o administrador.' },
        { status: 403 }
      )
    }

    // Generate a magic link for this user
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: colaborador.email,
      })

    if (linkError || !linkData) {
      console.error('Master login generateLink error:', linkError)
      return NextResponse.json({ error: 'Erro ao gerar sessão' }, { status: 500 })
    }

    // Extract the hashed_token to verify server-side
    const hashedToken = linkData.properties.hashed_token

    // Verify the OTP server-side to get a real session
    const { data: sessionData, error: verifyError } =
      await supabaseAdmin.auth.verifyOtp({
        type: 'magiclink',
        token_hash: hashedToken,
      })

    if (verifyError || !sessionData?.session) {
      console.error('Master login verifyOtp error:', verifyError)
      return NextResponse.json({ error: 'Erro ao criar sessão' }, { status: 500 })
    }

    return NextResponse.json({
      session: sessionData.session,
    })
  } catch (err) {
    console.error('Master login error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
