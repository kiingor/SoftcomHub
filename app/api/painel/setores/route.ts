import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { validatePainelAuth } from '@/lib/painel-auth'

/**
 * GET /api/painel/setores
 *
 * Lista todos os setores. Requer Basic Auth.
 */
export async function GET(request: NextRequest) {
  const authError = validatePainelAuth(request)
  if (authError) return authError

  try {
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('setores')
      .select('id, nome, descricao, created_at')
      .order('nome')

    if (error) {
      console.error('[painel/setores] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ setores: data })
  } catch (error: any) {
    console.error('[painel/setores] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
