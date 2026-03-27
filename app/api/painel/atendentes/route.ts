import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { validatePainelAuth } from '@/lib/painel-auth'

/**
 * GET /api/painel/atendentes?setor_id=UUID&date_from=ISO&date_to=ISO
 *
 * Lista atendentes com métricas. Filtra por setor_id (opcional).
 * date_from/date_to filtram os tickets para cálculo de métricas (default: hoje).
 * Requer Basic Auth.
 */
export async function GET(request: NextRequest) {
  const authError = validatePainelAuth(request)
  if (authError) return authError

  try {
    const supabase = createServiceClient()
    const { searchParams } = new URL(request.url)
    const setorId = searchParams.get('setor_id')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')

    // Período para métricas de tickets
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const periodFrom = dateFrom || startOfDay
    const periodTo = dateTo || now.toISOString()

    // 1) Buscar colaboradores com pausa atual e setores
    let colaboradorIds: string[] | null = null

    // Se filtrar por setor, buscar IDs dos colaboradores do setor
    if (setorId) {
      const { data: csData, error: csError } = await supabase
        .from('colaboradores_setores')
        .select('colaborador_id')
        .eq('setor_id', setorId)

      if (csError) {
        console.error('[painel/atendentes] Error fetching setor colaboradores:', csError)
        return NextResponse.json({ error: csError.message }, { status: 500 })
      }

      colaboradorIds = (csData || []).map((c) => c.colaborador_id)

      if (colaboradorIds.length === 0) {
        return NextResponse.json({ atendentes: [] })
      }
    }

    // 2) Buscar colaboradores
    let query = supabase
      .from('colaboradores')
      .select('id, nome, email, is_online, ativo, pausa_atual_id, last_heartbeat, created_at')
      .order('nome')

    if (colaboradorIds) {
      query = query.in('id', colaboradorIds)
    }

    const { data: colaboradores, error: colabError } = await query

    if (colabError) {
      console.error('[painel/atendentes] Error:', colabError)
      return NextResponse.json({ error: colabError.message }, { status: 500 })
    }

    if (!colaboradores || colaboradores.length === 0) {
      return NextResponse.json({ atendentes: [] })
    }

    const ids = colaboradores.map((c) => c.id)

    // 3) Buscar setores de cada colaborador
    const { data: colabSetores } = await supabase
      .from('colaboradores_setores')
      .select('colaborador_id, setor_id, setores(id, nome)')
      .in('colaborador_id', ids)

    const setoresByColab: Record<string, { id: string; nome: string }[]> = {}
    for (const cs of colabSetores || []) {
      const setor = cs.setores as any
      if (!setoresByColab[cs.colaborador_id]) setoresByColab[cs.colaborador_id] = []
      if (setor) setoresByColab[cs.colaborador_id].push({ id: setor.id, nome: setor.nome })
    }

    // 4) Buscar pausas ativas (pausa_atual_id != null)
    const pausaIds = colaboradores
      .filter((c) => c.pausa_atual_id)
      .map((c) => c.pausa_atual_id!)

    let pausasByColab: Record<string, { nome: string; inicio: string }> = {}
    if (pausaIds.length > 0) {
      const { data: pausasData } = await supabase
        .from('pausas_colaboradores')
        .select('id, colaborador_id, inicio, pausas(nome)')
        .in('id', pausaIds)

      for (const p of pausasData || []) {
        const pausa = p.pausas as any
        pausasByColab[p.colaborador_id] = {
          nome: pausa?.nome || null,
          inicio: p.inicio,
        }
      }
    }

    // 5) Contar tickets por colaborador no período
    const { data: ticketsData } = await supabase
      .from('tickets')
      .select('id, colaborador_id, status, criado_em, encerrado_em, primeira_resposta_em')
      .in('colaborador_id', ids)
      .gte('criado_em', periodFrom)
      .lte('criado_em', periodTo)

    // Calcular métricas por colaborador
    const metricsByColab: Record<
      string,
      {
        opened: number
        closed: number
        total: number
        totalAttendanceMs: number
        closedForAvg: number
        totalResponseMs: number
        respondedCount: number
      }
    > = {}

    for (const t of ticketsData || []) {
      const cid = t.colaborador_id
      if (!cid) continue
      if (!metricsByColab[cid]) {
        metricsByColab[cid] = {
          opened: 0,
          closed: 0,
          total: 0,
          totalAttendanceMs: 0,
          closedForAvg: 0,
          totalResponseMs: 0,
          respondedCount: 0,
        }
      }
      const m = metricsByColab[cid]
      m.total++

      if (t.status === 'encerrado') {
        m.closed++
        if (t.encerrado_em && t.criado_em) {
          m.totalAttendanceMs += new Date(t.encerrado_em).getTime() - new Date(t.criado_em).getTime()
          m.closedForAvg++
        }
      } else {
        m.opened++
      }

      if (t.primeira_resposta_em && t.criado_em) {
        m.totalResponseMs +=
          new Date(t.primeira_resposta_em).getTime() - new Date(t.criado_em).getTime()
        m.respondedCount++
      }
    }

    // 6) Montar resposta
    const atendentes = colaboradores.map((c) => {
      const m = metricsByColab[c.id]
      const pausa = pausasByColab[c.id]
      const nowMs = Date.now()

      // Derivar status
      let status: string
      if (c.pausa_atual_id && pausa) {
        status = 'Pausa'
      } else if (c.is_online) {
        status = 'Online'
      } else {
        status = 'Offline'
      }

      // Duração da pausa em segundos
      let break_duration_seconds: number | null = null
      if (pausa?.inicio) {
        break_duration_seconds = Math.floor((nowMs - new Date(pausa.inicio).getTime()) / 1000)
      }

      return {
        identity: c.id,
        full_name: c.nome,
        email: c.email,
        status,
        is_enabled: c.ativo,
        team: setoresByColab[c.id] || [],
        current_status_at: c.last_heartbeat,
        synced_at: c.last_heartbeat,
        opened_tickets: m?.opened ?? 0,
        closed_tickets: m?.closed ?? 0,
        break_reason: pausa?.nome ?? null,
        break_duration_seconds,
        avg_attendance_time_seconds:
          m && m.closedForAvg > 0 ? Math.round(m.totalAttendanceMs / m.closedForAvg / 1000) : null,
        avg_response_time_seconds:
          m && m.respondedCount > 0
            ? Math.round(m.totalResponseMs / m.respondedCount / 1000)
            : null,
        tickets_count: m?.total ?? 0,
      }
    })

    return NextResponse.json({ atendentes })
  } catch (error: any) {
    console.error('[painel/atendentes] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
