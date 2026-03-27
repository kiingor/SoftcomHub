import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { validatePainelAuth } from '@/lib/painel-auth'

/**
 * GET /api/painel/tickets?setor_id=UUID&date_from=ISO&date_to=ISO&status=aberto&page=1&per_page=50
 *
 * Lista tickets com dados relacionados. Filtra por setor_id, status e período.
 * Requer Basic Auth.
 */
export async function GET(request: NextRequest) {
  const authError = validatePainelAuth(request)
  if (authError) return authError

  try {
    const supabase = createServiceClient()
    const { searchParams } = new URL(request.url)
    const setorId = searchParams.get('setor_id')
    const status = searchParams.get('status')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') || '50')))
    const offset = (page - 1) * perPage

    // 1) Query tickets com joins
    let query = supabase
      .from('tickets')
      .select(
        `
        id, numero, status, setor_id, subsetor_id, colaborador_id, cliente_id,
        canal, prioridade, criado_em, encerrado_em, primeira_resposta_em,
        setores(id, nome),
        colaboradores(id, nome),
        clientes(id, nome, telefone)
      `,
        { count: 'exact' },
      )
      .order('criado_em', { ascending: false })
      .range(offset, offset + perPage - 1)

    if (setorId) {
      query = query.eq('setor_id', setorId)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (dateFrom) {
      query = query.gte('criado_em', dateFrom)
    }
    if (dateTo) {
      query = query.lte('criado_em', dateTo)
    }

    const { data: ticketsData, error, count } = await query

    if (error) {
      console.error('[painel/tickets] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!ticketsData || ticketsData.length === 0) {
      return NextResponse.json({ tickets: [], total: 0, page, per_page: perPage })
    }

    const ticketIds = ticketsData.map((t) => t.id)

    // 2) Contar mensagens por ticket
    const { data: msgCounts } = await supabase
      .from('mensagens')
      .select('ticket_id')
      .in('ticket_id', ticketIds)

    const msgCountByTicket: Record<string, number> = {}
    for (const m of msgCounts || []) {
      msgCountByTicket[m.ticket_id] = (msgCountByTicket[m.ticket_id] || 0) + 1
    }

    // 3) Buscar último log de status para status_at e closed_by
    const { data: statusLogs } = await supabase
      .from('ticket_logs')
      .select('ticket_id, tipo, descricao, autor_id, criado_em')
      .in('ticket_id', ticketIds)
      .eq('tipo', 'status')
      .order('criado_em', { ascending: false })

    const lastStatusLog: Record<string, { autor_id: string | null; criado_em: string }> = {}
    for (const log of statusLogs || []) {
      if (!lastStatusLog[log.ticket_id]) {
        lastStatusLog[log.ticket_id] = { autor_id: log.autor_id, criado_em: log.criado_em }
      }
    }

    // 4) Verificar distribuição automática
    const { data: assignLogs } = await supabase
      .from('ticket_assignment_logs')
      .select('ticket_id, action')
      .in('ticket_id', ticketIds)
      .eq('action', 'auto_assigned')

    const autoAssigned = new Set((assignLogs || []).map((a) => a.ticket_id))

    // 5) Montar resposta
    const tickets = ticketsData.map((t) => {
      const setor = t.setores as any
      const colaborador = t.colaboradores as any
      const cliente = t.clientes as any
      const statusLog = lastStatusLog[t.id]

      return {
        id: t.id,
        ticket: t.numero,
        status: t.status,
        team: setor ? { id: setor.id, nome: setor.nome } : null,
        attendant_identity: t.colaborador_id,
        attendant_name: colaborador?.nome ?? null,
        customer_identity: t.cliente_id,
        requester_name: cliente?.nome ?? null,
        provider: t.canal,
        open_at: t.criado_em,
        status_at: statusLog?.criado_em ?? t.criado_em,
        closed_at: t.encerrado_em,
        closed: t.status === 'encerrado',
        closed_by: t.status === 'encerrado' ? statusLog?.autor_id ?? null : null,
        messages: msgCountByTicket[t.id] || 0,
        first_response_at: t.primeira_resposta_em,
        priority: t.prioridade,
        automatic_distribution: autoAssigned.has(t.id),
      }
    })

    return NextResponse.json({
      tickets,
      total: count ?? tickets.length,
      page,
      per_page: perPage,
    })
  } catch (error: any) {
    console.error('[painel/tickets] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
