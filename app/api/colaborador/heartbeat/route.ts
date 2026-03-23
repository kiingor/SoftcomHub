import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

/**
 * POST /api/colaborador/heartbeat
 *
 * - Atualiza last_heartbeat (keep-alive enquanto o navegador está aberto)
 * - Quando setOffline=true, marca is_online=false (chamado no beforeunload/pagehide)
 * - Usa service role para bypassar RLS e garantir que a escrita SEMPRE funcione
 *
 * Body: { colaboradorId: string, setOffline?: boolean, isOnline?: boolean }
 */
export async function POST(request: Request) {
  try {
    const supabase = createServiceClient()

    // Aceita application/json ou text/plain (navigator.sendBeacon envia text/plain)
    let body: { colaboradorId?: string; setOffline?: boolean }
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      body = await request.json()
    } else {
      const text = await request.text()
      try {
        body = JSON.parse(text)
      } catch {
        body = {}
      }
    }

    const { colaboradorId, setOffline, isOnline } = body as {
      colaboradorId?: string; setOffline?: boolean; isOnline?: boolean
    }

    if (!colaboradorId) {
      return NextResponse.json({ error: 'colaboradorId required' }, { status: 400 })
    }

    if (setOffline) {
      // Chamado quando a aba/navegador fecha — marca offline
      const { error } = await supabase
        .from('colaboradores')
        .update({
          is_online: false,
          pausa_atual_id: null,
          last_heartbeat: new Date().toISOString(),
        })
        .eq('id', colaboradorId)

      if (error) {
        console.error('Heartbeat setOffline error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'offline' })
    }

    // Keep-alive normal — atualiza last_heartbeat
    // Se o cliente envia isOnline=true mas o banco tem is_online=false (crash, reconexão),
    // re-afirma is_online=true. Só re-afirma quando o cliente EXPLICITAMENTE diz que está online.
    const updateData: Record<string, unknown> = {
      last_heartbeat: new Date().toISOString(),
    }

    let reaffirmed = false
    if (isOnline === true) {
      // Cliente diz que está online — verificar se precisa re-afirmar
      const { data: current } = await supabase
        .from('colaboradores')
        .select('is_online')
        .eq('id', colaboradorId)
        .single()

      if (current && !current.is_online) {
        updateData.is_online = true
        reaffirmed = true
        console.log(`[Heartbeat] Re-afirmando is_online=true para ${colaboradorId} (cliente online, banco offline)`)
      }
    }

    const { error } = await supabase
      .from('colaboradores')
      .update(updateData)
      .eq('id', colaboradorId)

    if (error) {
      console.error('Heartbeat error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      action: reaffirmed ? 'heartbeat+reaffirm' : 'heartbeat',
    })
  } catch (error) {
    console.error('Heartbeat error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/colaborador/heartbeat
 * Retorna status atual do colaborador.
 */
export async function GET(request: Request) {
  try {
    const supabase = createServiceClient()
    const { searchParams } = new URL(request.url)
    const colaboradorId = searchParams.get('colaboradorId')

    if (!colaboradorId) {
      return NextResponse.json({ error: 'colaboradorId required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('colaboradores')
      .select('is_online, last_heartbeat, pausa_atual_id')
      .eq('id', colaboradorId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      isOnline: data.is_online,
      lastHeartbeat: data.last_heartbeat,
      pausaAtualId: data.pausa_atual_id,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
