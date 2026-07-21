import { createServiceClient } from '@/lib/supabase/service'
import { isExactSubsetorMatch } from '@/lib/subsetor-routing'
import { findActiveSupportSubsetor } from '@/lib/support-subsetor'
import { isTransbordoBloqueado } from '@/lib/transbordo-bloqueio'

interface DistribuicaoResult {
  ticketId: string
  colaboradorId: string | null
}

/**
 * Creates a new ticket and distributes it to an available collaborator
 * using round-robin distribution based on the sector's configuration.
 * If subsetorId is provided, it will prioritize collaborators assigned to that subsetor.
 * A collaborator can be assigned to multiple subsetores (via colaboradores_subsetores).
 */
export async function criarEDistribuirTicket(
  clienteId: string,
  setorId: string,
  canal: string = 'whatsapp',
  subsetorId: string | null = null
): Promise<DistribuicaoResult | null> {
  // Use service role client to bypass RLS — this function is called both from
  // authenticated user sessions and from bots/n8n without a user session.
  const supabase = createServiceClient()

  console.log(`[Distribuição] criarEDistribuirTicket chamada — clienteId=${clienteId}, setorId=${setorId}, canal=${canal}, subsetorId=${subsetorId}`)

  try {
    // 1. Get distribution config for this sector (tabela opcional)
    let maxTicketsPerAgent = 10
    let autoAssignEnabled = true
    try {
      const { data: config } = await supabase
        .from('ticket_distribution_config')
        .select('*')
        .eq('setor_id', setorId)
        .maybeSingle()
      if (config) {
        maxTicketsPerAgent = config.max_tickets_per_agent ?? 10
        autoAssignEnabled = config.auto_assign_enabled ?? true
      }
    } catch {
      // Tabela pode não existir — usar defaults
      console.log('[Distribution] ticket_distribution_config não disponível, usando defaults')
    }

    // 2. Create the ticket with subsetor if provided
    const ticketData: Record<string, unknown> = {
      cliente_id: clienteId,
      setor_id: setorId,
      status: 'aberto',
      canal: canal,
      prioridade: 'normal',
    }

    if (subsetorId) {
      ticketData.subsetor_id = subsetorId
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert(ticketData)
      .select('id')
      .single()

    if (ticketError || !ticket) {
      console.error('[criarEDistribuirTicket] Erro ao inserir ticket:', JSON.stringify(ticketError), 'Data:', JSON.stringify(ticketData))
      return null
    }

    // Vincula ao ticket recém-criado o histórico órfão do bot Nexus
    // (cliente-nexus/bot-nexus, sem ticket_id) para este cliente, para que o
    // atendente veja a conversa anterior com o bot. Agrupa por telefone porque
    // o bot pode ter gravado a conversa em registros de cliente distintos com o
    // mesmo número. Mesmo raciocínio de /api/nexus/abrir-ticket — aqui cobre
    // TODOS os caminhos de criação de ticket (webhook do WhatsApp, disparo,
    // /api/tickets/criar), não só o botão manual "abrir ticket" do painel Nexus.
    // Best-effort: falha aqui não deve impedir a criação/distribuição do ticket.
    try {
      let clienteIdsMesmoTelefone = [clienteId]
      const { data: clienteRow } = await supabase
        .from('clientes')
        .select('telefone')
        .eq('id', clienteId)
        .maybeSingle()
      if (clienteRow?.telefone) {
        const { data: mesmosTelefone } = await supabase
          .from('clientes')
          .select('id')
          .eq('telefone', clienteRow.telefone)
        if (mesmosTelefone && mesmosTelefone.length > 0) {
          clienteIdsMesmoTelefone = [...new Set(mesmosTelefone.map((c) => c.id))]
        }
      }
      const { error: linkNexusError, count: nexusLinkedCount } = await supabase
        .from('mensagens')
        .update({ ticket_id: ticket.id }, { count: 'exact' })
        .in('cliente_id', clienteIdsMesmoTelefone)
        .is('ticket_id', null)
        .in('remetente', ['cliente-nexus', 'bot-nexus'])

      if (linkNexusError) {
        console.warn('[criarEDistribuirTicket] Falha ao vincular histórico do Nexus:', linkNexusError.message)
      } else if (nexusLinkedCount) {
        console.log(`[criarEDistribuirTicket] ${nexusLinkedCount} mensagem(ns) do Nexus vinculada(s) ao ticket ${ticket.id}`)
      }
    } catch (nexusLinkErr) {
      console.warn('[criarEDistribuirTicket] Erro ao tentar vincular histórico do Nexus:', nexusLinkErr)
    }

    let assignedColaboradorId: string | null = null

    // 3. If auto-assign is enabled, find an available collaborator
    if (autoAssignEnabled) {
      // Compatíveis primeiro; fallback só quando não existe compatível online.
      const HEARTBEAT_STALE_MS = 5 * 60 * 1000
      const now = Date.now()
      const isHBFresh = (lh: string | null): boolean => lh ? (now - new Date(lh).getTime()) < HEARTBEAT_STALE_MS : false

      const { data: setorLinks, error: setorLinksError } = await supabase
        .from('colaboradores_setores')
        .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id, last_heartbeat, last_ticket_received_at, setores_ativos_sessao)')
        .eq('setor_id', setorId)
      let routingLookupFailed = Boolean(setorLinksError)
      if (setorLinksError) {
        console.error('[Distribution] Erro ao buscar colaboradores do setor:', setorLinksError)
      }
      const rawSetorColabs = (setorLinks || []).map((cs: any) => cs.colaboradores)

      let rawCompatibleColabs = rawSetorColabs
      if (subsetorId) {
        const { data, error } = await supabase
          .from('colaboradores_subsetores')
          .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id, last_heartbeat, last_ticket_received_at, setores_ativos_sessao)')
          .eq('setor_id', setorId)
          .eq('subsetor_id', subsetorId)
        if (error) {
          routingLookupFailed = true
          console.error('[Distribution] Erro ao buscar colaboradores do subsetor:', error)
        }
        rawCompatibleColabs = (data || []).map((sl: any) => sl.colaboradores)
      }

      const STALE_CLEANUP_MS = 5 * 60 * 1000 // 5 min — marcar offline automaticamente
      const toFresh = (raw: any[]) => [...new Map(
        raw
          .filter((c: any) => {
            if (!c?.ativo || !c.is_online || c.pausa_atual_id || !isHBFresh(c.last_heartbeat)) return false
            const activeSetores: string[] = Array.isArray(c.setores_ativos_sessao) ? c.setores_ativos_sessao : []
            return activeSetores.includes(setorId)
          })
          .map((c: any) => [c.id, {
            id: c.id,
            nome: c.nome,
            last_ticket_received_at: c.last_ticket_received_at || null,
          }]),
      ).values()]

      const fallbackColaboradores = toFresh(rawSetorColabs)
      let compatibleColaboradores = toFresh(rawCompatibleColabs)
      const subsetoresByColaborador = new Map<string, string[]>()
      if (fallbackColaboradores.length > 0) {
        const fallbackIds = fallbackColaboradores.map((c) => c.id)
        const { data: subsetorLinks, error: subsetorLinksError } = await supabase
          .from('colaboradores_subsetores')
          .select('colaborador_id, subsetor_id')
          .eq('setor_id', setorId)
          .in('colaborador_id', fallbackIds)
        if (subsetorLinksError) {
          routingLookupFailed = true
          console.error('[Distribution] Erro ao verificar especialistas do setor:', subsetorLinksError)
        }
        for (const link of subsetorLinks || []) {
          const ids = subsetoresByColaborador.get(link.colaborador_id) || []
          ids.push(link.subsetor_id)
          subsetoresByColaborador.set(link.colaborador_id, ids)
        }
      }

      if (!subsetorId && compatibleColaboradores.length > 0) {
        compatibleColaboradores = compatibleColaboradores.filter((c) =>
          isExactSubsetorMatch(null, subsetoresByColaborador.get(c.id) || []),
        )
      }

      // Cleanup: marcar offline atendentes com heartbeat muito antigo (> 5 min).
      // NÃO toca em setores_ativos_sessao — é configuração permanente do admin.
      const allRawColabs = [...new Map(
        [...rawSetorColabs, ...rawCompatibleColabs]
          .filter(Boolean)
          .map((c: any) => [c.id, c]),
      ).values()]
      const veryStale = allRawColabs.filter((c: any) =>
        c.is_online && (!c.last_heartbeat || (now - new Date(c.last_heartbeat).getTime()) > STALE_CLEANUP_MS)
      )
      if (veryStale.length > 0) {
        const staleIds = veryStale.map((c: any) => c.id)
        console.log(`[Distribution] Cleanup: marcando ${staleIds.length} atendentes offline (heartbeat > 5 min)`)
        await supabase
          .from('colaboradores')
          .update({ is_online: false })
          .in('id', staleIds)
      }

      const hasCompatibleOnline = compatibleColaboradores.length > 0
      let fallbackSemPrioridadePendente = fallbackColaboradores
      if (!routingLookupFailed && !hasCompatibleOnline && fallbackColaboradores.length > 0) {
        const { data: pendingTickets, error: pendingTicketsError } = await supabase
          .from('tickets')
          .select('id, subsetor_id')
          .eq('setor_id', setorId)
          .in('status', ['aberto', 'em_atendimento'])
          .is('colaborador_id', null)
          .neq('id', ticket.id)

        if (pendingTicketsError) {
          routingLookupFailed = true
          console.error('[Distribution] Erro ao verificar prioridades pendentes:', pendingTicketsError)
        } else {
          fallbackSemPrioridadePendente = fallbackColaboradores.filter((colaborador) =>
            !(pendingTickets || []).some((pendingTicket) =>
              isExactSubsetorMatch(
                pendingTicket.subsetor_id,
                subsetoresByColaborador.get(colaborador.id) || [],
              ),
            ),
          )
        }
      }
      const finalColaboradores = routingLookupFailed
        ? []
        : hasCompatibleOnline
        ? compatibleColaboradores
        : fallbackSemPrioridadePendente
      const fallbackReservados = fallbackColaboradores.length - fallbackSemPrioridadePendente.length
      console.log(`[Distribution] Disponíveis: ${finalColaboradores.length}; compatíveis online: ${compatibleColaboradores.length}; fallback=${!hasCompatibleOnline}; reservados para fila compatível=${fallbackReservados}; setor=${setorId}; subsetor=${subsetorId || 'null'}`)

      if (finalColaboradores.length > 0) {
        // Get current ticket counts for each collaborator
        const colaboradorIds = finalColaboradores.map(c => c.id)

        const { data: ticketCounts } = await supabase
          .from('tickets')
          .select('colaborador_id')
          .in('colaborador_id', colaboradorIds)
          .in('status', ['aberto', 'em_atendimento'])

        // Count tickets per collaborator
        const countMap: Record<string, number> = {}
        ticketCounts?.forEach(t => {
          if (t.colaborador_id) {
            countMap[t.colaborador_id] = (countMap[t.colaborador_id] || 0) + 1
          }
        })

        // Ordenar: 1) menor quantidade de tickets, 2) quem recebeu ticket há MAIS tempo (round-robin real)
        // Usa last_ticket_received_at (atualizado no momento da atribuição) em vez de criado_em do ticket
        const sorted = finalColaboradores
          .map(c => ({
            id: c.id,
            nome: c.nome,
            count: countMap[c.id] || 0,
            lastReceivedAt: c.last_ticket_received_at || '1970-01-01',
          }))
          .filter(c => c.count < maxTicketsPerAgent)
          .sort((a, b) => {
            if (a.count !== b.count) return a.count - b.count
            // Empate: quem recebeu há MAIS tempo vai primeiro (round-robin real)
            return a.lastReceivedAt.localeCompare(b.lastReceivedAt)
          })

        console.log(`[Distribution] Ranking: ${sorted.map(c => `${c.nome}(${c.count}t, lastRcv=${c.lastReceivedAt.slice(0,19)})`).join(', ')}`)

        // Tentar atribuir via RPC atômica percorrendo `sorted`. Se o primeiro candidato
        // já saturou (race), tenta o próximo. Garante que max_tickets_per_agent é
        // respeitado mesmo sob distribuições concorrentes.
        for (const candidate of sorted) {
          const { data: result, error: rpcError } = await supabase.rpc('try_atomic_assign_ticket_in_context', {
            p_ticket_id: ticket.id,
            p_colaborador_id: candidate.id,
            p_max_tickets: maxTicketsPerAgent,
            p_expected_setor_id: setorId,
            p_expected_subsetor_id: subsetorId,
          })

          if (rpcError) {
            console.error(`[Distribution] RPC try_atomic_assign_ticket_in_context falhou para ${candidate.nome}:`, rpcError)
            continue
          }

          const assigned = (result as any)?.assigned === true

          if (assigned) {
            assignedColaboradorId = candidate.id

            try {
              await supabase.from('ticket_assignment_logs').insert({
                ticket_id: ticket.id,
                colaborador_id: candidate.id,
                setor_id: setorId,
                action: 'auto_assigned',
                assignment_reason: `Round-robin: ${candidate.count} tickets, último recebido em ${candidate.lastReceivedAt.slice(0,19)}`,
              })
            } catch { /* tabela pode não existir */ }

            break
          }

          const reason = (result as any)?.reason || 'unknown'
          console.log(`[Distribution] ${candidate.nome} recusado (${reason}, count=${(result as any)?.current_count}) — tentando próximo`)

          // Se o ticket já foi atribuído por outro processo, não adianta continuar
          if (reason === 'ticket_already_assigned') {
            break
          }
        }
      }
    }

    // Se ninguém foi atribuído e auto-assign está ativo, verificar transmissão
    if (!assignedColaboradorId && autoAssignEnabled) {
      console.log(`[Distribuição] Ticket ${ticket.id} sem atribuição — verificando transmissão do setor ${setorId}`)

      try {
        const { data: setorData } = await supabase
          .from('setores')
          .select('transmissao_ativa, setor_receptor_id')
          .eq('id', setorId)
          .single()

        console.log(`[Distribuição] Setor ${setorId}: transmissao_ativa=${setorData?.transmissao_ativa}, setor_receptor_id=${setorData?.setor_receptor_id}`)

        if (setorData?.transmissao_ativa && !setorData?.setor_receptor_id) {
          console.warn(`[Distribuição] ⚠️ Setor ${setorId} tem transmissao_ativa=true mas setor_receptor_id está vazio — transbordo NÃO funciona. Configure o setor receptor.`)
        }

        // Regra de negócio: NÃO transbordar enquanto houver atendente ONLINE
        // servindo este setor — is_online (botão online), ativo e com este setor
        // ativo na sessão. SEM janela de inatividade: offline é só pela ação do
        // atendente (botão de ficar offline no WorkDesk). Cobre "online mas no
        // limite".
        const { data: linkRowsTransbordo } = await supabase
          .from('colaboradores_setores')
          .select('colaboradores(is_online, ativo, setores_ativos_sessao)')
          .eq('setor_id', setorId)
        const setorTemAtendentePresente = (linkRowsTransbordo || []).some((r: any) => {
          const c = r.colaboradores
          if (!c || !c.is_online || !c.ativo) return false
          const sess = Array.isArray(c.setores_ativos_sessao) ? c.setores_ativos_sessao : []
          return sess.includes(setorId)
        })

        if (setorTemAtendentePresente) {
          console.log(`[Distribuição] Setor ${setorId} tem atendente(s) online servindo o setor — ticket ${ticket.id} fica na fila (sem transbordo).`)
        } else if (setorData?.transmissao_ativa && setorData?.setor_receptor_id && await isTransbordoBloqueado(supabase, setorId)) {
          // Janela de bloqueio de transbordo (ex.: almoço): aguarda na fila.
          console.log(`[Distribuição] Transbordo bloqueado por horário no setor ${setorId} — ticket ${ticket.id} aguarda na fila.`)
        } else if (setorData?.transmissao_ativa && setorData?.setor_receptor_id) {
          const receptorId = setorData.setor_receptor_id
          console.log(`[Distribuição] Transmitindo ticket ${ticket.id} para setor receptor ${receptorId}`)

          const supportSubsetor = await findActiveSupportSubsetor(supabase, receptorId)
          if (!supportSubsetor) {
            throw new Error(`Setor receptor ${receptorId} não possui subsetor Suporte ativo; transbordo cancelado.`)
          }

          // Nomes dos setores pra log (origem + destino)
          const { data: nomesSetores } = await supabase
            .from('setores').select('id, nome').in('id', [setorId, receptorId])
          const nomeOrigem = nomesSetores?.find(s => s.id === setorId)?.nome || setorId
          const nomeDestino = nomesSetores?.find(s => s.id === receptorId)?.nome || receptorId

          const { data: movedTicket, error: moveError } = await supabase
            .from('tickets')
            .update({
              setor_id: receptorId,
              subsetor_id: supportSubsetor.id,
            })
            .eq('id', ticket.id)
            .eq('setor_id', setorId)
            .eq('status', 'aberto')
            .is('colaborador_id', null)
            .select('id')
            .maybeSingle()

          if (moveError) {
            console.error(`[Distribuição] Falha ao mover ticket ${ticket.id}:`, moveError)
          } else if (movedTicket) {
            const { error: logError } = await supabase.from('ticket_logs').insert({
              ticket_id: ticket.id,
              tipo: 'transferencia_automatica',
              descricao: `Transbordo: ${nomeOrigem} → ${nomeDestino} (sem atendentes disponíveis no setor original)`,
            })
            if (logError) console.warn('[Distribuição] Falha ao gravar log transferencia_automatica:', logError.message)

            const receptorResult = await _tentarDistribuirNoSetor(supabase, ticket.id, receptorId)
            if (receptorResult) {
              assignedColaboradorId = receptorResult
            }
          }
        }
      } catch (transmissaoError) {
        console.error('[Distribuição] Erro ao verificar transmissão:', transmissaoError)
      }
    }

    // Log ticket creation
    const { error: criacaoLogError } = await supabase.from('ticket_logs').insert({
      ticket_id: ticket.id,
      tipo: 'criacao',
      descricao: assignedColaboradorId
        ? `Ticket criado e atribuído automaticamente`
        : `Ticket criado e aguardando atribuição`,
    })
    if (criacaoLogError) console.warn('[Distribuição] Falha ao gravar log criacao:', criacaoLogError.message)

    return {
      ticketId: ticket.id,
      colaboradorId: assignedColaboradorId,
    }
  } catch (error) {
    console.error('Error in criarEDistribuirTicket:', error)
    return null
  }
}

/**
 * Helper interno: tenta distribuir um ticket a um colaborador disponível
 * dentro de um setor específico (usado para distribuição no receptor).
 * Não faz retransmissão — evita loops.
 */
async function _tentarDistribuirNoSetor(
  supabase: ReturnType<typeof createServiceClient>,
  ticketId: string,
  setorId: string
): Promise<string | null> {
  const HEARTBEAT_STALE_MS = 5 * 60 * 1000
  const now = Date.now()

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('subsetor_id')
    .eq('id', ticketId)
    .maybeSingle()
  if (ticketError || !ticket) {
    console.error('[_tentarDistribuirNoSetor] Ticket não encontrado ao resolver subsetor:', ticketError)
    return null
  }
  const ticketSubsetorId = ticket.subsetor_id ?? null

  let maxTicketsPerAgent = 10
  try {
    const { data: config } = await supabase
      .from('ticket_distribution_config')
      .select('max_tickets_per_agent')
      .eq('setor_id', setorId)
      .maybeSingle()
    if (config) maxTicketsPerAgent = config.max_tickets_per_agent ?? 10
  } catch { /* tabela pode não existir */ }

  const { data: rawColabs } = await supabase
    .from('colaboradores')
    .select(`id, last_heartbeat, last_ticket_received_at, setores_ativos_sessao, colaboradores_setores!inner(setor_id)`)
    .eq('colaboradores_setores.setor_id', setorId)
    .eq('is_online', true)
    .eq('ativo', true)
    .is('pausa_atual_id', null)

  if (!rawColabs || rawColabs.length === 0) return null

  // Filtra por setor ativo na sessão E por heartbeat fresco
  const colabsAtivos = rawColabs.filter((c: any) => {
    const setoresAtivos: string[] = Array.isArray(c.setores_ativos_sessao) ? c.setores_ativos_sessao : []
    return setoresAtivos.includes(setorId)
  })
  const colaboradores = colabsAtivos.filter(c =>
    c.last_heartbeat && (now - new Date(c.last_heartbeat).getTime()) < HEARTBEAT_STALE_MS
  )
  console.log(`[_tentarDistribuirNoSetor] setor=${setorId}: ${rawColabs.length} online, ${colabsAtivos.length} com setor ativo, ${colaboradores.length} com heartbeat fresco`)

  if (colaboradores.length === 0) return null

  const colaboradorIds = colaboradores.map(c => c.id)
  const { data: subsetorLinks, error: subsetorLinksError } = await supabase
    .from('colaboradores_subsetores')
    .select('colaborador_id, subsetor_id')
    .eq('setor_id', setorId)
    .in('colaborador_id', colaboradorIds)
  if (subsetorLinksError) {
    console.error('[_tentarDistribuirNoSetor] Erro ao buscar vínculos de subsetor:', subsetorLinksError)
    return null
  }
  const subsetoresByColaborador = new Map<string, string[]>()
  for (const link of subsetorLinks || []) {
    const ids = subsetoresByColaborador.get(link.colaborador_id) || []
    ids.push(link.subsetor_id)
    subsetoresByColaborador.set(link.colaborador_id, ids)
  }
  const compatibleColaboradores = colaboradores.filter((c) =>
    isExactSubsetorMatch(ticketSubsetorId, subsetoresByColaborador.get(c.id) || []),
  )
  const routingColaboradores = compatibleColaboradores.length > 0
    ? compatibleColaboradores
    : colaboradores

  const { data: ticketCounts } = await supabase
    .from('tickets')
    .select('colaborador_id')
    .in('colaborador_id', colaboradorIds)
    .in('status', ['aberto', 'em_atendimento'])

  const countMap: Record<string, number> = {}
  ticketCounts?.forEach(t => {
    if (t.colaborador_id) {
      countMap[t.colaborador_id] = (countMap[t.colaborador_id] || 0) + 1
    }
  })

  // Round-robin: desempate por last_ticket_received_at (atualizado no momento da atribuição)
  const sorted = routingColaboradores
    .map(c => ({
      id: c.id,
      count: countMap[c.id] || 0,
      lastReceivedAt: (c as any).last_ticket_received_at || '1970-01-01',
    }))
    .filter(c => c.count < maxTicketsPerAgent)
    .sort((a, b) => {
      if (a.count !== b.count) return a.count - b.count
      return a.lastReceivedAt.localeCompare(b.lastReceivedAt)
    })

  if (sorted.length === 0) return null

  // Tentar atribuir via RPC atômica percorrendo candidatos. Se o primeiro saturou
  // por concorrência, tenta o próximo.
  for (const candidate of sorted) {
    const { data: result, error: rpcError } = await supabase.rpc('try_atomic_assign_ticket_in_context', {
      p_ticket_id: ticketId,
      p_colaborador_id: candidate.id,
      p_max_tickets: maxTicketsPerAgent,
      p_expected_setor_id: setorId,
      p_expected_subsetor_id: ticketSubsetorId,
    })

    if (rpcError) {
      console.error(`[_tentarDistribuirNoSetor] RPC falhou para ${candidate.id}:`, rpcError)
      continue
    }

    const assigned = (result as any)?.assigned === true

    if (assigned) {
      try {
        await supabase.from('ticket_assignment_logs').insert({
          ticket_id: ticketId,
          colaborador_id: candidate.id,
          setor_id: setorId,
          action: 'auto_assigned',
          assignment_reason: `Auto-assigned no setor receptor (${candidate.count} tickets)`,
        })
      } catch { /* tabela pode não existir */ }

      return candidate.id
    }

    const reason = (result as any)?.reason || 'unknown'
    console.log(`[_tentarDistribuirNoSetor] ${candidate.id} recusado (${reason}, count=${(result as any)?.current_count}) — tentando próximo`)

    if (reason === 'ticket_already_assigned') {
      return null
    }
  }

  return null
}

/**
 * Redistributes unassigned tickets to available collaborators.
 * Respects subsetor assignment — tickets com subsetor são atribuídos
 * preferencialmente a colaboradores do subsetor (via colaboradores_subsetores).
 * Um colaborador pode atender múltiplos subsetores.
 */
export async function redistribuirTicketsPendentes(setorId: string): Promise<number> {
  const supabase = createServiceClient()
  let assignedCount = 0

  try {
    // Get unassigned tickets in this sector, including subsetor_id
    const { data: pendingTickets } = await supabase
      .from('tickets')
      .select('id, cliente_id, subsetor_id')
      .eq('setor_id', setorId)
      .eq('status', 'aberto')
      .is('colaborador_id', null)
      .order('criado_em', { ascending: true })

    if (!pendingTickets || pendingTickets.length === 0) {
      return 0
    }

    // Get distribution config (tabela opcional)
    let maxTicketsPerAgent = 10
    try {
      const { data: config } = await supabase
        .from('ticket_distribution_config')
        .select('max_tickets_per_agent')
        .eq('setor_id', setorId)
        .maybeSingle()
      if (config) maxTicketsPerAgent = config.max_tickets_per_agent ?? 10
    } catch { /* tabela pode não existir */ }

    // Get ALL available collaborators in this setor
    const HEARTBEAT_STALE_MS = 5 * 60 * 1000
    const now = Date.now()

    const { data: rawColaboradores } = await supabase
      .from('colaboradores')
      .select(`
        id,
        last_heartbeat,
        last_ticket_received_at,
        setores_ativos_sessao,
        colaboradores_setores!inner(setor_id)
      `)
      .eq('colaboradores_setores.setor_id', setorId)
      .eq('is_online', true)
      .eq('ativo', true)
      .is('pausa_atual_id', null)

    // Filtra por setor ativo na sessão E por heartbeat fresco
    const colabsAtivos = (rawColaboradores || []).filter((c: any) => {
      const setoresAtivos: string[] = Array.isArray(c.setores_ativos_sessao) ? c.setores_ativos_sessao : []
      return setoresAtivos.includes(setorId)
    })
    const allColaboradores = colabsAtivos.filter(c =>
      c.last_heartbeat && (now - new Date(c.last_heartbeat).getTime()) < HEARTBEAT_STALE_MS
    )
    console.log(`[redistribuirTicketsPendentes] setor=${setorId}: ${rawColaboradores?.length || 0} online, ${colabsAtivos.length} com setor ativo, ${allColaboradores.length} com heartbeat fresco`)

    if (allColaboradores.length === 0) {
      // Nenhum atendente online — verificar se o setor tem transmissão ativa
      const { data: setorData } = await supabase
        .from('setores')
        .select('transmissao_ativa, setor_receptor_id')
        .eq('id', setorId)
        .single()

      if (setorData?.transmissao_ativa && setorData?.setor_receptor_id) {
        const receptorId = setorData.setor_receptor_id
        console.log(`[Redistribuição] Sem atendentes em ${setorId} — transmitindo ${pendingTickets.length} tickets para receptor ${receptorId}`)

        const supportSubsetor = await findActiveSupportSubsetor(supabase, receptorId)
        if (!supportSubsetor) {
          console.error(`[Redistribuição] Setor receptor ${receptorId} não possui subsetor Suporte ativo; transbordo cancelado.`)
          return assignedCount
        }

        // Nomes dos setores pra log (busca 1× antes do loop)
        const { data: nomesSetores } = await supabase
          .from('setores').select('id, nome').in('id', [setorId, receptorId])
        const nomeOrigem = nomesSetores?.find(s => s.id === setorId)?.nome || setorId
        const nomeDestino = nomesSetores?.find(s => s.id === receptorId)?.nome || receptorId

        for (const ticket of pendingTickets) {
          const { data: movedTicket, error: moveError } = await supabase
            .from('tickets')
            .update({
              setor_id: receptorId,
              subsetor_id: supportSubsetor.id,
            })
            .eq('id', ticket.id)
            .eq('setor_id', setorId)
            .eq('status', 'aberto')
            .is('colaborador_id', null)
            .select('id')
            .maybeSingle()

          if (moveError) {
            console.error(`[Redistribuição] Falha ao mover ticket ${ticket.id}:`, moveError)
          } else if (movedTicket) {
            const { error: logError } = await supabase.from('ticket_logs').insert({
              ticket_id: ticket.id,
              tipo: 'transferencia_automatica',
              descricao: `Transbordo: ${nomeOrigem} → ${nomeDestino} (nenhum atendente online no setor original)`,
            })
            if (logError) console.warn('[Distribuição] Falha ao gravar log transferencia_automatica:', logError.message)

            const result = await _tentarDistribuirNoSetor(supabase, ticket.id, receptorId)
            if (result) {
              assignedCount++
            }
          }
        }
      }

      return assignedCount
    }

    // Buscar todos os vínculos de subsetores para os colaboradores disponíveis
    const colaboradorIds = allColaboradores.map(c => c.id)
    const { data: subsetorLinks, error: subsetorLinksError } = await supabase
      .from('colaboradores_subsetores')
      .select('colaborador_id, subsetor_id')
      .eq('setor_id', setorId)
      .in('colaborador_id', colaboradorIds)

    if (subsetorLinksError) {
      console.error('[redistribuirTicketsPendentes] Erro ao buscar vínculos de subsetor:', subsetorLinksError)
      return assignedCount
    }

    const subsetoresByColaborador = new Map<string, string[]>()
    for (const link of (subsetorLinks || [])) {
      const ids = subsetoresByColaborador.get(link.colaborador_id) || []
      ids.push(link.subsetor_id)
      subsetoresByColaborador.set(link.colaborador_id, ids)
    }

    // Get current ticket counts for all collaborators
    const { data: ticketCounts } = await supabase
      .from('tickets')
      .select('colaborador_id')
      .in('colaborador_id', colaboradorIds)
      .in('status', ['aberto', 'em_atendimento'])

    const countMap: Record<string, number> = {}
    ticketCounts?.forEach(t => {
      if (t.colaborador_id) {
        countMap[t.colaborador_id] = (countMap[t.colaborador_id] || 0) + 1
      }
    })

    // Round-robin: usar last_ticket_received_at (atualizado no momento real da atribuição)
    const lastReceivedMap: Record<string, string> = {}
    allColaboradores.forEach(c => {
      lastReceivedMap[c.id] = (c as any).last_ticket_received_at || '1970-01-01'
    })

    const assignTicket = async (
      ticket: (typeof pendingTickets)[number],
      eligibleColaboradores: typeof allColaboradores,
      routingPass: 'compatible' | 'fallback',
    ): Promise<boolean> => {
      const sorted = eligibleColaboradores
        .map(c => ({
          id: c.id,
          count: countMap[c.id] || 0,
          lastReceivedAt: lastReceivedMap[c.id] || '1970-01-01',
        }))
        .filter(c => c.count < maxTicketsPerAgent)
        .sort((a, b) => {
          if (a.count !== b.count) return a.count - b.count
          return a.lastReceivedAt.localeCompare(b.lastReceivedAt)
        })

      for (const candidate of sorted) {
        const { data: result, error: rpcError } = await supabase.rpc('try_atomic_assign_ticket_in_context', {
          p_ticket_id: ticket.id,
          p_colaborador_id: candidate.id,
          p_max_tickets: maxTicketsPerAgent,
          p_expected_setor_id: setorId,
          p_expected_subsetor_id: ticket.subsetor_id ?? null,
        })

        if (rpcError) {
          console.error(`[redistribuirTicketsPendentes] RPC falhou para ${candidate.id}:`, rpcError)
          continue
        }

        const assigned = (result as any)?.assigned === true

        if (assigned) {
          // Update count map e lastReceivedMap para próximas iterações (ordenação do próximo ticket)
          countMap[candidate.id] = (countMap[candidate.id] || 0) + 1
          lastReceivedMap[candidate.id] = new Date().toISOString()
          assignedCount++

          const reason = ticket.subsetor_id
            ? `Round-robin redistribuição (${routingPass}, subsetor: ${ticket.subsetor_id}, ${candidate.count} tickets)`
            : `Round-robin redistribuição (${routingPass}, ${candidate.count} tickets)`

          try {
            await supabase.from('ticket_assignment_logs').insert({
              ticket_id: ticket.id,
              colaborador_id: candidate.id,
              setor_id: setorId,
              action: 'redistributed',
              assignment_reason: reason,
            })
          } catch { /* tabela pode não existir */ }

          return true
        }

        const failReason = (result as any)?.reason || 'unknown'
        console.log(`[redistribuirTicketsPendentes] ${candidate.id} recusado (${failReason}, count=${(result as any)?.current_count}) — tentando próximo`)

        // Se a RPC indicou saturação, atualizar countMap local para refletir (evita re-tentar o mesmo no próximo ticket)
        if (failReason === 'max_tickets_reached') {
          countMap[candidate.id] = (result as any)?.current_count ?? maxTicketsPerAgent
        }

        if (failReason === 'ticket_already_assigned') {
          return false
        }
      }

      return false
    }

    const fallbackTickets: typeof pendingTickets = []

    for (const ticket of pendingTickets) {
      const compatibleColaboradores = allColaboradores.filter((c) =>
        isExactSubsetorMatch(
          ticket.subsetor_id,
          subsetoresByColaborador.get(c.id) || [],
        ),
      )

      if (compatibleColaboradores.length === 0) {
        fallbackTickets.push(ticket)
        continue
      }

      await assignTicket(ticket, compatibleColaboradores, 'compatible')
    }

    for (const ticket of fallbackTickets) {
      await assignTicket(ticket, allColaboradores, 'fallback')
    }

    return assignedCount
  } catch (error) {
    console.error('Error redistributing tickets:', error)
    return assignedCount
  }
}
