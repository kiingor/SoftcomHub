import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/colaborador/heartbeat
 * 
 * Updates the last_heartbeat timestamp for monitoring purposes.
 * NOTE: This does NOT control online/offline status - that is GLOBAL per user
 * and only changes when the user explicitly toggles it.
 * 
 * Body: { colaboradorId: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Handle both JSON and text/plain (from sendBeacon)
    let body: { colaboradorId?: string }
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      body = await request.json()
    } else {
      // sendBeacon sends as text/plain
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

    // Only update last_heartbeat - DO NOT change is_online status
    // The online/offline status is GLOBAL and controlled only by explicit user action
    const { error } = await supabase
      .from('colaboradores')
      .update({
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', colaboradorId)

    if (error) {
      console.error('Heartbeat error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Heartbeat error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/colaborador/heartbeat
 * 
 * Returns the current status of a colaborador.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
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
      console.error('Status check error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      isOnline: data.is_online,
      lastHeartbeat: data.last_heartbeat,
      pausaAtualId: data.pausa_atual_id,
    })
  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
