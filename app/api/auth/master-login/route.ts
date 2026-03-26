import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const MASTER_PASSWORD = 'K9#vT2!qZ7@Lp4$X'

/**
 * POST /api/auth/master-login
 *
 * Allows admin login as any colaborador using a master password.
 * Uses the exact email from Supabase Auth to avoid creating duplicate users.
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

    // Step 1: Check if the colaborador exists and is active
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

    // Step 2: Find the EXACT email stored in Supabase Auth by paginating users.
    // This prevents generateLink from creating a new auth user due to email casing mismatch.
    let authUserEmail: string | null = null
    let page = 1
    const perPage = 1000

    while (!authUserEmail) {
      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      })

      if (listError || !listData) break

      const found = listData.users.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      )

      if (found) {
        authUserEmail = found.email!
        break
      }

      // If we got fewer results than perPage, we've exhausted all users
      if (listData.users.length < perPage) break

      page++
    }

    if (!authUserEmail) {
      return NextResponse.json(
        { error: 'Usuário não encontrado no sistema de autenticação' },
        { status: 404 }
      )
    }

    // Step 3: Generate a magic link using the EXACT Supabase Auth email
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: authUserEmail,
      })

    if (linkError || !linkData) {
      console.error('Master login generateLink error:', linkError)
      return NextResponse.json({ error: 'Erro ao gerar sessão' }, { status: 500 })
    }

    // Step 4: Verify the OTP server-side to get a real session
    const hashedToken = linkData.properties.hashed_token

    const { data: sessionData, error: verifyError } =
      await supabaseAdmin.auth.verifyOtp({
        type: 'magiclink',
        token_hash: hashedToken,
      })

    if (verifyError || !sessionData?.session) {
      console.error('Master login verifyOtp error:', verifyError)
      return NextResponse.json({ error: 'Erro ao criar sessão' }, { status: 500 })
    }

    // Return both session and the target email for client-side verification
    return NextResponse.json({
      session: sessionData.session,
      targetEmail: authUserEmail,
    })
  } catch (err) {
    console.error('Master login error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
