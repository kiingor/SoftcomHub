import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const setorId = request.nextUrl.searchParams.get('setorId')
    if (!setorId) {
      return NextResponse.json({ error: 'setorId obrigatorio' }, { status: 400 })
    }

    const { data: setor } = await supabase
      .from('setores')
      .select('max_disparos_dia')
      .eq('id', setorId)
      .single()

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { count, error: countError } = await supabase
      .from('disparo_logs')
      .select('*', { count: 'exact', head: true })
      .eq('setor_id', setorId)
      .gte('criado_em', todayStart.toISOString())

    if (countError) {
      console.warn('[Dispatch count] Não foi possível consultar os disparos do dia:', countError.code)
      return NextResponse.json({ error: 'Não foi possível consultar os disparos do dia' }, { status: 503 })
    }

    return NextResponse.json({
      used: count || 0,
      limit: setor?.max_disparos_dia || 0,
      blocked: setor?.max_disparos_dia ? (count || 0) >= setor.max_disparos_dia : false,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
