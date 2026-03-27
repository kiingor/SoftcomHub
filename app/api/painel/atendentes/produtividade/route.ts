import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { validatePainelAuth } from '@/lib/painel-auth'

/**
 * GET /api/painel/atendentes/produtividade?setor_id=UUID&date=YYYY-MM-DD
 *
 * Retorna produtividade dos atendentes para uma data específica.
 * Calcula tempos de login, online, pausa e offline a partir dos logs.
 * Filtra por setor_id (opcional). date default: hoje. Requer Basic Auth.
 */
export async function GET(request: NextRequest) {
  const authError = validatePainelAuth(request)
  if (authError) return authError

  try {
    const supabase = createServiceClient()
    const { searchParams } = new URL(request.url)
    const setorId = searchParams.get('setor_id')
    const dateParam = searchParams.get('date')

    // Data de referência
    const refDate = dateParam ? new Date(dateParam + 'T00:00:00') : new Date()
    const dayStart = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate())
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    const dayStartISO = dayStart.toISOString()
    const dayEndISO = dayEnd.toISOString()
    const isToday = dayEnd.getTime() > Date.now()
    const nowOrEnd = isToday ? new Date().toISOString() : dayEndISO

    // 1) Buscar colaboradores (filtrar por setor se necessário)
    let colaboradorIds: string[] | null = null

    if (setorId) {
      const { data: csData } = await supabase
        .from('colaboradores_setores')
        .select('colaborador_id')
        .eq('setor_id', setorId)

      colaboradorIds = (csData || []).map((c) => c.colaborador_id)
      if (colaboradorIds.length === 0) {
        return NextResponse.json({ produtividade: [] })
      }
    }

    let colabQuery = supabase
      .from('colaboradores')
      .select('id, nome, email, is_online, last_heartbeat')
      .order('nome')

    if (colaboradorIds) {
      colabQuery = colabQuery.in('id', colaboradorIds)
    }

    const { data: colaboradores, error: colabError } = await colabQuery

    if (colabError) {
      console.error('[painel/atendentes/produtividade] Error:', colabError)
      return NextResponse.json({ error: colabError.message }, { status: 500 })
    }

    if (!colaboradores || colaboradores.length === 0) {
      return NextResponse.json({ produtividade: [] })
    }

    const ids = colaboradores.map((c) => c.id)

    // 2) Buscar disponibilidade_logs do dia
    const { data: logs } = await supabase
      .from('disponibilidade_logs')
      .select('colaborador_id, status, timestamp')
      .in('colaborador_id', ids)
      .gte('timestamp', dayStartISO)
      .lte('timestamp', dayEndISO)
      .order('timestamp', { ascending: true })

    // Buscar último log ANTES do dia para saber estado inicial
    const { data: priorLogs } = await supabase
      .from('disponibilidade_logs')
      .select('colaborador_id, status, timestamp')
      .in('colaborador_id', ids)
      .lt('timestamp', dayStartISO)
      .order('timestamp', { ascending: false })

    // Estado inicial de cada colaborador no início do dia
    const initialState: Record<string, string> = {}
    for (const log of priorLogs || []) {
      if (!initialState[log.colaborador_id]) {
        initialState[log.colaborador_id] = log.status // primeiro resultado = mais recente
      }
    }

    // Agrupar logs por colaborador
    const logsByColab: Record<string, { status: string; timestamp: string }[]> = {}
    for (const log of logs || []) {
      if (!logsByColab[log.colaborador_id]) logsByColab[log.colaborador_id] = []
      logsByColab[log.colaborador_id].push({ status: log.status, timestamp: log.timestamp })
    }

    // 3) Buscar pausas do dia
    const { data: pausasData } = await supabase
      .from('pausas_colaboradores')
      .select('colaborador_id, inicio, fim, duracao_minutos')
      .in('colaborador_id', ids)
      .gte('inicio', dayStartISO)
      .lte('inicio', dayEndISO)

    const pausasByColab: Record<string, { inicio: string; fim: string | null; duracao_minutos: number | null }[]> = {}
    for (const p of pausasData || []) {
      if (!pausasByColab[p.colaborador_id]) pausasByColab[p.colaborador_id] = []
      pausasByColab[p.colaborador_id].push({
        inicio: p.inicio,
        fim: p.fim,
        duracao_minutos: p.duracao_minutos,
      })
    }

    // 4) Calcular tempos
    const produtividade = colaboradores.map((c) => {
      const colabLogs = logsByColab[c.id] || []
      const colabPausas = pausasByColab[c.id] || []
      const startState = initialState[c.id] || 'offline'

      // Calcular tempo online/offline a partir dos logs
      let onlineMs = 0
      let loginMs = 0 // tempo total logado (online + pausa)
      let currentState = startState
      let lastTransition = dayStart.getTime()

      for (const log of colabLogs) {
        const logTime = new Date(log.timestamp).getTime()
        const duration = logTime - lastTransition

        if (currentState === 'online') {
          onlineMs += duration
          loginMs += duration
        }

        currentState = log.status
        lastTransition = logTime
      }

      // Fechar período até agora/fim do dia
      const endTime = isToday ? Date.now() : dayEnd.getTime()
      const remaining = endTime - lastTransition
      if (currentState === 'online') {
        onlineMs += remaining
        loginMs += remaining
      }

      // Calcular tempo de pausa
      let pausaMs = 0
      for (const p of colabPausas) {
        if (p.duracao_minutos != null) {
          pausaMs += p.duracao_minutos * 60 * 1000
        } else {
          // Pausa em andamento
          const inicio = new Date(p.inicio).getTime()
          const fim = p.fim ? new Date(p.fim).getTime() : (isToday ? Date.now() : dayEnd.getTime())
          pausaMs += fim - inicio
        }
      }

      // Login = online + pausa (tempo logado total)
      loginMs += pausaMs

      // Online descontando pausas
      const onlineEffectiveMs = Math.max(0, onlineMs - pausaMs)

      // Offline = tempo do dia - login
      const dayTotalMs = endTime - dayStart.getTime()
      const offlineMs = Math.max(0, dayTotalMs - loginMs)

      return {
        identity: c.id,
        full_name: c.nome,
        email: c.email,
        date: dayStart.toISOString().split('T')[0],
        login_minutes: Math.round(loginMs / 60000),
        online_minutes: Math.round(onlineEffectiveMs / 60000),
        paused_minutes: Math.round(pausaMs / 60000),
        offline_minutes: Math.round(offlineMs / 60000),
        current_status_at: c.last_heartbeat,
      }
    })

    return NextResponse.json({ produtividade })
  } catch (error: any) {
    console.error('[painel/atendentes/produtividade] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
