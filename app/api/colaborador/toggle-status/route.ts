import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/colaborador/toggle-status
 *
 * Altera o status online/offline do colaborador usando service role (bypassa RLS).
 * Isso garante que a escrita SEMPRE funcione, independente das policies do Supabase.
 *
 * Body: { colaboradorId: string, isOnline: boolean, pausaAtualId?: string | null }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient()
    const body = await request.json()

    const { colaboradorId, isOnline, pausaAtualId } = body as {
      colaboradorId?: string
      isOnline?: boolean
      pausaAtualId?: string | null
    }

    if (!colaboradorId) {
      return NextResponse.json({ error: 'colaboradorId required' }, { status: 400 })
    }

    if (typeof isOnline !== 'boolean') {
      return NextResponse.json({ error: 'isOnline (boolean) required' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      is_online: isOnline,
      pausa_atual_id: pausaAtualId ?? null,
      last_heartbeat: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('colaboradores')
      .update(updateData)
      .eq('id', colaboradorId)
      .select('id, is_online, pausa_atual_id')
      .single()

    if (error) {
      console.error('[toggle-status] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[toggle-status] Colaborador ${colaboradorId} → is_online=${isOnline}, pausa=${pausaAtualId ?? 'null'}`)

    return NextResponse.json({
      success: true,
      colaborador: data,
    })
  } catch (error: any) {
    console.error('[toggle-status] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
