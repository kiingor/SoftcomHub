import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isExactSubsetorMatch } from '@/lib/subsetor-routing'
import { ordenarTicketsPorFila } from '@/lib/ticket-fifo'
import { registrarOrigemDaAtribuicao } from '@/lib/transbordo-marca'

/**
 * POST /api/tickets/pull-next
 *
 * Puxa MANUALMENTE o próximo ticket da fila para o colaborador, ignorando o limite
 * max_tickets_per_agent do setor. Usado para o botão "Puxar próximo" do workdesk.
 *
 * Estratégia: usa a RPC try_atomic_assign_ticket com p_max_tickets bem alto, mantendo
 * a atomicidade contra race com o auto-assign mas pulando o gate de limite.
 *
 * Body:
 * - colaboradorId: string (obrigatório)
 *
 * Resposta:
 * - 200: { success: true, ticketId, reason }
 * - 404: { error: "Fila vazia" }
 * - 422: { error: "Colaborador offline / em pausa" }
 */
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { colaboradorId } = body

    if (!colaboradorId) {
      return NextResponse.json({ error: 'colaboradorId é obrigatório' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 1. Validar colaborador (online, ativo, sem pausa) + buscar setores_ativos_sessao
    const { data: colab, error: colabError } = await supabase
      .from('colaboradores')
      .select('id, nome, is_online, ativo, pausa_atual_id, setores_ativos_sessao')
      .eq('id', colaboradorId)
      .eq('email', user.email)
      .maybeSingle()

    if (colabError || !colab) {
      return NextResponse.json({ error: 'Você só pode puxar tickets para o seu próprio atendimento' }, { status: 403 })
    }

    if (!colab.ativo) {
      return NextResponse.json({ error: 'Colaborador inativo' }, { status: 422 })
    }

    if (!colab.is_online) {
      return NextResponse.json(
        { error: 'Você precisa estar online para puxar um ticket' },
        { status: 422 }
      )
    }

    if (colab.pausa_atual_id) {
      return NextResponse.json(
        { error: 'Você está em pausa. Volte ao atendimento para puxar tickets.' },
        { status: 422 }
      )
    }

    // 2. Buscar setores do colaborador + filtrar pelos ATIVOS na sessão.
    //    Atendente que admin desativou pra um setor NÃO deve puxar ticket dele,
    //    mesmo estando vinculado.
    const { data: vinculos } = await supabase
      .from('colaboradores_setores')
      .select('setor_id')
      .eq('colaborador_id', colaboradorId)

    const setoresVinculados = [...new Set((vinculos || []).map((v) => v.setor_id))]
    if (setoresVinculados.length === 0) {
      return NextResponse.json({ error: 'Colaborador sem setores vinculados' }, { status: 422 })
    }

    const setoresAtivos: string[] = Array.isArray(colab.setores_ativos_sessao)
      ? colab.setores_ativos_sessao
      : []
    // Interseção: só setores que estão vinculados E ativos na sessão
    const setorIds = setoresVinculados.filter((s) => setoresAtivos.includes(s))
    if (setorIds.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum setor ativo. Peça ao admin pra ativar pelo menos um setor pra você em "Atendentes".' },
        { status: 422 }
      )
    }

    const { data: callerSubsetorLinks, error: callerSubsetorError } = await supabase
      .from('colaboradores_subsetores')
      .select('setor_id, subsetor_id')
      .eq('colaborador_id', colaboradorId)
      .in('setor_id', setorIds)

    if (callerSubsetorError) {
      return NextResponse.json({ error: 'Erro ao verificar subsetores do colaborador' }, { status: 500 })
    }

    const callerSubsetoresBySetor = new Map<string, string[]>()
    for (const link of callerSubsetorLinks || []) {
      const subsetorIds = callerSubsetoresBySetor.get(link.setor_id) || []
      subsetorIds.push(link.subsetor_id)
      callerSubsetoresBySetor.set(link.setor_id, subsetorIds)
    }

    // 3. Buscar tickets em fila (mais antigos primeiro) nos setores do colaborador
    const { data: queuedTicketsData, error: fetchError } = await supabase
      .from('tickets')
      .select('id, setor_id, subsetor_id, criado_em')
      .eq('status', 'aberto')
      .is('colaborador_id', null)
      .in('setor_id', setorIds)
      .order('criado_em', { ascending: true })
      .order('id', { ascending: true })

    if (fetchError) {
      return NextResponse.json(
        { error: 'Erro ao buscar fila', details: fetchError.message },
        { status: 500 }
      )
    }

    const queuedTickets = ordenarTicketsPorFila(queuedTicketsData || [])

    if (queuedTickets.length === 0) {
      return NextResponse.json({ error: 'Nenhum ticket na fila' }, { status: 404 })
    }

    const [setorLinksResult, subsetorLinksResult] = await Promise.all([
      supabase
        .from('colaboradores_setores')
        .select('setor_id, colaborador_id, colaboradores(id, is_online, ativo, pausa_atual_id, last_heartbeat, setores_ativos_sessao)')
        .in('setor_id', setorIds),
      supabase
        .from('colaboradores_subsetores')
        .select('setor_id, subsetor_id, colaborador_id, colaboradores(id, is_online, ativo, pausa_atual_id, last_heartbeat, setores_ativos_sessao)')
        .in('setor_id', setorIds),
    ])

    if (setorLinksResult.error || subsetorLinksResult.error) {
      return NextResponse.json({ error: 'Erro ao verificar disponibilidade por subsetor' }, { status: 500 })
    }

    const onlineIdsBySetor = new Map<string, Set<string>>()
    const subsetoresBySetorColaborador = new Map<string, string[]>()
    const heartbeatFreshAfter = Date.now() - 5 * 60 * 1000
    const isAvailableInSetor = (row: any): boolean => {
      const c = row.colaboradores
      const activeSetores: string[] = Array.isArray(c?.setores_ativos_sessao)
        ? c.setores_ativos_sessao
        : []
      const lastHeartbeat = c?.last_heartbeat ? new Date(c.last_heartbeat).getTime() : 0
      return Boolean(
        c?.is_online
        && c?.ativo
        && !c?.pausa_atual_id
        && lastHeartbeat >= heartbeatFreshAfter
        && activeSetores.includes(row.setor_id),
      )
    }
    const addOnline = (setorId: string, colaboradorId: string) => {
      const ids = onlineIdsBySetor.get(setorId) || new Set<string>()
      ids.add(colaboradorId)
      onlineIdsBySetor.set(setorId, ids)
    }

    for (const row of setorLinksResult.data || []) {
      if (isAvailableInSetor(row)) addOnline(row.setor_id, row.colaborador_id)
    }
    for (const row of subsetorLinksResult.data || []) {
      const key = `${row.setor_id}:${row.colaborador_id}`
      const ids = subsetoresBySetorColaborador.get(key) || []
      ids.push(row.subsetor_id)
      subsetoresBySetorColaborador.set(key, ids)
      if (isAvailableInSetor(row)) addOnline(row.setor_id, row.colaborador_id)
    }

    const compatibleTickets = queuedTickets.filter((ticket) =>
      isExactSubsetorMatch(
        ticket.subsetor_id,
        callerSubsetoresBySetor.get(ticket.setor_id) || [],
      ),
    )
    const compatibleTicketIds = new Set(compatibleTickets.map((ticket) => ticket.id))
    const fallbackTickets = queuedTickets.filter((ticket) => {
      if (compatibleTicketIds.has(ticket.id)) return false

      const hasCompatibleOnline = [...(onlineIdsBySetor.get(ticket.setor_id) || [])].some(
        (id) => isExactSubsetorMatch(
          ticket.subsetor_id,
          subsetoresBySetorColaborador.get(`${ticket.setor_id}:${id}`) || [],
        ),
      )
      return !hasCompatibleOnline
    })
    const prioritizedTickets = [...compatibleTickets, ...fallbackTickets]

    if (prioritizedTickets.length === 0) {
      return NextResponse.json(
        { error: 'Há tickets na fila, mas eles possuem atendentes compatíveis online.' },
        { status: 409 },
      )
    }

    // 4. Tentar atribuir o primeiro disponível via RPC atômica.
    // p_max_tickets alto (999999) efetivamente desabilita o gate de limite — este endpoint
    // é a porta de saída controlada para atendente puxar manualmente acima do max.
    const UNLIMITED = 999999
    for (const ticket of prioritizedTickets) {
      const isFallback = !compatibleTicketIds.has(ticket.id)
      const { data: result, error: rpcError } = await supabase.rpc('try_atomic_assign_ticket', {
        p_ticket_id: ticket.id,
        p_colaborador_id: colaboradorId,
        p_max_tickets: UNLIMITED,
      })

      if (rpcError) {
        console.error('[pull-next] RPC falhou:', rpcError)
        continue
      }

      const r = result as { assigned?: boolean; reason?: string; current_count?: number }
      if (r?.assigned === true) {
        // Caso #97066: puxar por fallback é o mesmo transbordo, só que iniciado
        // à mão. O ticket carrega de onde veio pelo mesmo caminho — inclusive
        // para apagar marca de um ciclo anterior quando o subsetor é o próprio.
        await registrarOrigemDaAtribuicao(
          supabase,
          ticket.id,
          isFallback ? 'transbordo' : 'proprio',
          ticket.subsetor_id,
        )
        // Log para auditoria
        await supabase.from('ticket_logs').insert({
          ticket_id: ticket.id,
          tipo: 'pull_manual',
          descricao: `${colab.nome} puxou ticket manualmente${isFallback ? ' por fallback de subsetor' : ''} (${r.current_count} ticket(s) ativos, bypass do limite do setor)`,
        }).then(({ error }) => {
          if (error) console.warn('[pull-next] Falha ao gravar log:', error.message)
        })

        return NextResponse.json({
          success: true,
          ticketId: ticket.id,
          currentCount: r.current_count,
          fallback: isFallback,
        })
      }

      // ticket_already_assigned → tentar próximo da fila
      console.log(`[pull-next] Ticket ${ticket.id} indisponível (${r?.reason}). Tentando próximo.`)
    }

    return NextResponse.json(
      { error: 'Tickets da fila foram atribuídos a outros atendentes' },
      { status: 409 }
    )
  } catch (error) {
    console.error('[pull-next] Erro inesperado:', error)
    return NextResponse.json(
      { error: 'Erro interno', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
