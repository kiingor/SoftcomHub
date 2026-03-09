import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * DELETE /api/admin/delete-user
 *
 * Remove um colaborador e seu usuário do Supabase Auth.
 * Usa service_role key para deletar o auth user.
 */
export async function DELETE(request: Request) {
  try {
    const body = await request.json()
    const { colaboradorId, email } = body

    if (!colaboradorId) {
      return NextResponse.json(
        { error: 'colaboradorId é obrigatório' },
        { status: 400 }
      )
    }

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

    // 1. Remover vínculos de setores
    await supabaseAdmin
      .from('colaborador_setores')
      .delete()
      .eq('colaborador_id', colaboradorId)

    // 2. Remover o colaborador
    const { error: colabError } = await supabaseAdmin
      .from('colaboradores')
      .delete()
      .eq('id', colaboradorId)

    if (colabError) {
      console.error('Erro ao deletar colaborador:', colabError)
      return NextResponse.json(
        { error: colabError.message },
        { status: 500 }
      )
    }

    // 3. Deletar o usuário do Auth pelo email (busca pelo email)
    if (email) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers()
      const authUser = users?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      )

      if (authUser) {
        await supabaseAdmin.auth.admin.deleteUser(authUser.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro em delete-user:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
