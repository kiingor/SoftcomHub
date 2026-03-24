import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

/**
 * POST /api/colaborador/heartbeat
 *
 * Apenas atualiza last_heartbeat (keep-alive para monitoramento).
 * NUNCA altera is_online — o status é controlado EXCLUSIVAMENTE
 * pelo usuário via toggle-status API (botão online/offline/pausa/logout).
 *
 * Body: { colaboradorId: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = createServiceClient()

    // Aceita application/json ou text/plain
    let body: { colaboradorId?: string }
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

    const { colaboradorId } = body

    if (!colaboradorId) {
      return NextResponse.json({ error: 'colaboradorId required' }, { status: 400 })
    }

    // Keep-alive — SOMENTE atualiza last_heartbeat
    const { error } = await supabase
      .from('colaboradores')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('id', colaboradorId)

    if (error) {
      console.error('Heartbeat error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, action: 'heartbeat' })
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
