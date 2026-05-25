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

    const { colaboradorId, isOnline, pausaAtualId, setoresAtivos } = body as {
      colaboradorId?: string
      isOnline?: boolean
      pausaAtualId?: string | null
      setoresAtivos?: string[]
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

    // setores_ativos_sessao:
    //   - isOnline=true → valida e usa o array enviado (deve ter ≥ 1)
    //   - isOnline=false + pausa → NÃO toca (preserva escolha pra quando voltar)
    //   - isOnline=false + sem pausa → limpa (offline puro reseta a sessão)
    if (isOnline) {
      if (!Array.isArray(setoresAtivos) || setoresAtivos.length === 0) {
        return NextResponse.json(
          { error: 'setoresAtivos (string[] não vazio) é obrigatório quando isOnline=true' },
          { status: 400 },
        )
      }
      // Valida que os setores enviados realmente pertencem ao colaborador
      const { data: vinculos } = await supabase
        .from('colaboradores_setores')
        .select('setor_id')
        .eq('colaborador_id', colaboradorId)
      const setoresPermitidos = new Set((vinculos || []).map((v: any) => v.setor_id))
      const setoresAtivosArr = setoresAtivos.filter(s => setoresPermitidos.has(s))
      if (setoresAtivosArr.length === 0) {
        return NextResponse.json(
          { error: 'Nenhum dos setores enviados está vinculado ao colaborador' },
          { status: 400 },
        )
      }
      updateData.setores_ativos_sessao = setoresAtivosArr
    } else if (pausaAtualId == null) {
      // Offline puro (sem pausa) → reseta sessão
      updateData.setores_ativos_sessao = []
    }
    // else: indo pra pausa — preserva a escolha

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

    // Quando colaborador fica offline, dispara reprocessamento da fila em fire-and-forget.
    // Garante que o último atendente saindo já desencadeia transbordo imediato,
    // sem esperar o cron periódico.
    if (isOnline === false) {
      import('@/lib/ticket-queue-processor')
        .then(({ processTicketQueue }) => {
          processTicketQueue().catch((err) =>
            console.error('[toggle-status] Erro no reprocessamento async:', err)
          )
        })
        .catch((err) =>
          console.error('[toggle-status] Erro ao carregar processTicketQueue:', err)
        )
    }

    return NextResponse.json({
      success: true,
      colaborador: data,
    })
  } catch (error: any) {
    console.error('[toggle-status] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
