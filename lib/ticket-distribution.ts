import { createServiceClient } from '@/lib/supabase/service'
import { marcarSaidaDaFila } from '@/lib/ticket-assignment-stamp'
import { resolverSubsetorPadrao } from '@/lib/server/subsetor-padrao-resolver'
import { escolherDestino, ordenarPorEquilibrio } from '@/lib/distribuicao-fila'
import { isExactSubsetorMatch } from '@/lib/subsetor-routing'
import { isTransbordoBloqueado } from '@/lib/transbordo-bloqueio'
import { ordenarTicketsPorFila } from '@/lib/ticket-fifo'

interface DistribuicaoResult {
  ticketId: string
  colaboradorId: string | null
  created: boolean
  setorId: string
}

type IdempotencyWinner = {
  ticketId: string
  clienteId: string
  setorId: string
  subsetorId: string | null
  canal: string
  status: string
  colaboradorId: string | null
}

export class TicketIdempotencyConflictError extends Error {
  constructor(readonly winner: IdempotencyWinner) {
    super('A sessão Nexus já foi convertida em outro contexto de atendimento.')
    this.name = 'TicketIdempotencyConflictError'
  }
}

interface TicketCreationMetadata {
  tipoAtendimento?: string | null
  idempotency?: {
    ticketId: string
    acceptedClientIds?: readonly string[]
  }
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
  subsetorId: string | null = null,
  metadata: TicketCreationMetadata = {},
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

    if (metadata.idempotency?.ticketId) {
      ticketData.id = metadata.idempotency.ticketId
    }

    // Sem subsetor informado, cai no padrão derivado do cadastro do setor.
    // Ticket órfão só casa com atendente sem vínculo de subsetor no passe
    // compatível — no ServiceDesk, 4 de 75 pessoas. Medido em 28/07/2026: 41%
    // dos tickets do setor chegavam assim, e 98% em Suporte a Franquias.
    const subsetorEfetivo = subsetorId || await resolverSubsetorPadrao(supabase, setorId)
    if (subsetorEfetivo) {
      ticketData.subsetor_id = subsetorEfetivo
    }
    const tipoAtendimento = metadata.tipoAtendimento?.trim()
    if (tipoAtendimento) {
      ticketData.tipo_atendimento = tipoAtendimento
    }

    let insertResult = await supabase
      .from('tickets')
      .insert(ticketData)
      .select('id')
      .single()
    const missingClassifierColumn = insertResult.error
      && ['42703', 'PGRST204'].includes(insertResult.error.code || '')
      && insertResult.error.message.includes('tipo_atendimento')

    if (missingClassifierColumn && ticketData.tipo_atendimento) {
      const compatibleTicketData = { ...ticketData }
      delete compatibleTicketData.tipo_atendimento
      insertResult = await supabase
        .from('tickets')
        .insert(compatibleTicketData)
        .select('id')
        .single()
    }

    let ticket = insertResult.data
    let ticketError = insertResult.error

    const duplicateIdempotentTicket = ticketError?.code === '23505'
      && Boolean(metadata.idempotency?.ticketId)

    if (duplicateIdempotentTicket) {
      const acceptedClientIds = new Set(
        metadata.idempotency?.acceptedClientIds?.length
          ? metadata.idempotency.acceptedClientIds
          : [clienteId],
      )
      const { data: existingTicket, error: existingTicketError } = await supabase
        .from('tickets')
        .select('id, cliente_id, setor_id, subsetor_id, canal, status, colaborador_id')
        .eq('id', metadata.idempotency!.ticketId)
        .maybeSingle()

      if (existingTicketError) {
        console.error('[criarEDistribuirTicket] Falha ao recuperar ticket idempotente:', existingTicketError)
        return null
      }
      if (!existingTicket || !acceptedClientIds.has(existingTicket.cliente_id)) {
        console.error('[criarEDistribuirTicket] Conflito inesperado no identificador idempotente do ticket')
        return null
      }

      const winner: IdempotencyWinner = {
        ticketId: existingTicket.id,
        clienteId: existingTicket.cliente_id,
        setorId: existingTicket.setor_id,
        subsetorId: existingTicket.subsetor_id,
        canal: existingTicket.canal,
        status: existingTicket.status,
        colaboradorId: existingTicket.colaborador_id,
      }
      if (!['aberto', 'em_atendimento'].includes(winner.status)) {
        throw new TicketIdempotencyConflictError(winner)
      }

      if (tipoAtendimento) {
        const { error: classifierUpdateError } = await supabase
          .from('tickets')
          .update({ tipo_atendimento: tipoAtendimento })
          .eq('id', existingTicket.id)
        if (
          classifierUpdateError
          && !(
            ['42703', 'PGRST204'].includes(classifierUpdateError.code || '')
            && classifierUpdateError.message.includes('tipo_atendimento')
          )
        ) {
          throw classifierUpdateError
        }
      }

      return {
        ticketId: existingTicket.id,
        colaboradorId: existingTicket.colaborador_id,
        created: false,
        setorId: existingTicket.setor_id,
      }
    }

    if (ticketError || !ticket) {
      console.error('[criarEDistribuirTicket] Erro ao inserir ticket:', JSON.stringify(ticketError), 'Data:', JSON.stringify(ticketData))
      return null
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

      // Todos os atendentes disponíveis do setor. Quem atende o subsetor do
      // ticket e quem entra por transbordo é decidido em `escolherDestino`.
      const fallbackColaboradores = toFresh(rawSetorColabs)
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

      // Cleanup: marcar offline atendentes com heartbeat muito antigo (> 5 min).
      // NÃO toca em setores_ativos_sessao — é configuração permanente do admin.
      const allRawColabs = [...new Map(
        rawSetorColabs
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

      // Subsetores que ainda têm ticket esperando: quem tem fila própria não é
      // puxado por transbordo (o Prime esvazia o Prime antes de ajudar o Suporte).
      let subsetoresComFila: (string | null)[] = []
      if (!routingLookupFailed && fallbackColaboradores.length > 0) {
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
          subsetoresComFila = [...new Set((pendingTickets || []).map((t) => t.subsetor_id ?? null))]
        }
      }

      // Quantos cada um já recebeu HOJE — é o que a regra equaliza. Carga aberta
      // continua valendo, mas como teto, não como critério de ordem.
      const inicioDoDia = new Date()
      inicioDoDia.setHours(0, 0, 0, 0)
      const colaboradorIds = fallbackColaboradores.map((c) => c.id)
      const [abertosResult, recebidosHojeResult] = colaboradorIds.length > 0
        ? await Promise.all([
            supabase
              .from('tickets')
              .select('colaborador_id')
              .in('colaborador_id', colaboradorIds)
              .in('status', ['aberto', 'em_atendimento']),
            supabase
              .from('tickets')
              .select('colaborador_id')
              .in('colaborador_id', colaboradorIds)
              .gte('criado_em', inicioDoDia.toISOString()),
          ])
        : [{ data: [] }, { data: [] }]

      const contar = (linhas: { colaborador_id: string | null }[] | null) => {
        const mapa: Record<string, number> = {}
        for (const l of linhas || []) {
          if (l.colaborador_id) mapa[l.colaborador_id] = (mapa[l.colaborador_id] || 0) + 1
        }
        return mapa
      }
      const abertosPorColaborador = contar(abertosResult.data)
      const recebidosHojePorColaborador = contar(recebidosHojeResult.data)

      const escolha = routingLookupFailed
        ? { fila: [], origem: 'ninguem' as const }
        : escolherDestino({
            subsetorDoTicket: subsetorEfetivo,
            candidatos: fallbackColaboradores.map((c) => ({
              id: c.id,
              nome: c.nome,
              ticketsAbertos: abertosPorColaborador[c.id] || 0,
              recebidosHoje: recebidosHojePorColaborador[c.id] || 0,
              ultimaAtribuicaoEm: c.last_ticket_received_at || null,
              subsetorIds: subsetoresByColaborador.get(c.id) || [],
            })),
            subsetoresComFila,
            maxTicketsAbertos: maxTicketsPerAgent,
          })

      const sorted = escolha.fila
      console.log(`[Distribution] Origem=${escolha.origem}; candidatos=${sorted.length}; setor=${setorId}; subsetor=${subsetorEfetivo || 'null'}`)

      if (sorted.length > 0) {
        console.log(`[Distribution] Ranking: ${sorted.map(c => `${c.nome}(hoje=${c.recebidosHoje}, abertos=${c.ticketsAbertos})`).join(', ')}`)

        // Tentar atribuir via RPC atômica percorrendo `sorted`. Se o primeiro candidato
        // já saturou (race), tenta o próximo. Garante que max_tickets_per_agent é
        // respeitado mesmo sob distribuições concorrentes.
        for (const candidate of sorted) {
          const { data: result, error: rpcError } = await supabase.rpc('try_atomic_assign_ticket', {
            p_ticket_id: ticket.id,
            p_colaborador_id: candidate.id,
            p_max_tickets: maxTicketsPerAgent,
          })

          if (rpcError) {
            console.error(`[Distribution] RPC try_atomic_assign_ticket falhou para ${candidate.nome}:`, rpcError)
            continue
          }

          const assigned = (result as any)?.assigned === true

          if (assigned) {
            assignedColaboradorId = candidate.id
            await marcarSaidaDaFila(supabase, ticket.id)

            try {
              await supabase.from('ticket_assignment_logs').insert({
                ticket_id: ticket.id,
                colaborador_id: candidate.id,
                setor_id: setorId,
                action: 'auto_assigned',
                assignment_reason: `Equilíbrio (${escolha.origem}): recebidos hoje=${candidate.recebidosHoje}, abertos=${candidate.ticketsAbertos}`,
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
          const subsetorDestino = await resolverSubsetorPadrao(supabase, receptorId)
          console.log(`[Distribuição] Transmitindo ticket ${ticket.id} para setor receptor ${receptorId}`)

          // Nomes dos setores pra log (origem + destino)
          const { data: nomesSetores } = await supabase
            .from('setores').select('id, nome').in('id', [setorId, receptorId])
          const nomeOrigem = nomesSetores?.find(s => s.id === setorId)?.nome || setorId
          const nomeDestino = nomesSetores?.find(s => s.id === receptorId)?.nome || receptorId

          let moveQuery = supabase
            .from('tickets')
            .update({
              setor_id: receptorId,
              subsetor_id: subsetorDestino,
            })
            .eq('id', ticket.id)
            .eq('setor_id', setorId)
            .eq('status', 'aberto')
            .is('colaborador_id', null)

          moveQuery = subsetorEfetivo == null
            ? moveQuery.is('subsetor_id', null)
            : moveQuery.eq('subsetor_id', subsetorEfetivo)

          const { data: movedTicket, error: moveError } = await moveQuery
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

    const { data: finalTicket } = await supabase
      .from('tickets')
      .select('setor_id')
      .eq('id', ticket.id)
      .maybeSingle()

    return {
      ticketId: ticket.id,
      colaboradorId: assignedColaboradorId,
      created: true,
      setorId: finalTicket?.setor_id || setorId,
    }
  } catch (error) {
    if (error instanceof TicketIdempotencyConflictError) throw error
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
    const { data: result, error: rpcError } = await supabase.rpc('try_atomic_assign_ticket', {
      p_ticket_id: ticketId,
      p_colaborador_id: candidate.id,
      p_max_tickets: maxTicketsPerAgent,
    })

    if (rpcError) {
      console.error(`[_tentarDistribuirNoSetor] RPC falhou para ${candidate.id}:`, rpcError)
      continue
    }

    const assigned = (result as any)?.assigned === true

    if (assigned) {
      await marcarSaidaDaFila(supabase, ticketId)
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
    const { data: pendingTicketsData } = await supabase
      .from('tickets')
      .select('id, cliente_id, subsetor_id, criado_em')
      .eq('setor_id', setorId)
      .eq('status', 'aberto')
      .is('colaborador_id', null)
      .order('criado_em', { ascending: true })
      .order('id', { ascending: true })

    const pendingTickets = ordenarTicketsPorFila(pendingTicketsData || [])

    if (pendingTickets.length === 0) {
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

        // Nomes dos setores pra log (busca 1× antes do loop)
        const { data: nomesSetores } = await supabase
          .from('setores').select('id, nome').in('id', [setorId, receptorId])
        const nomeOrigem = nomesSetores?.find(s => s.id === setorId)?.nome || setorId
        const nomeDestino = nomesSetores?.find(s => s.id === receptorId)?.nome || receptorId

        for (const ticket of pendingTickets) {
          const subsetorDestino = await resolverSubsetorPadrao(supabase, receptorId)
          let moveQuery = supabase
            .from('tickets')
            .update({
              setor_id: receptorId,
              subsetor_id: subsetorDestino,
            })
            .eq('id', ticket.id)
            .eq('setor_id', setorId)
            .eq('status', 'aberto')
            .is('colaborador_id', null)

          moveQuery = ticket.subsetor_id == null
            ? moveQuery.is('subsetor_id', null)
            : moveQuery.eq('subsetor_id', ticket.subsetor_id)

          const { data: movedTicket, error: moveError } = await moveQuery
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

    // Carga aberta (teto) e volume recebido hoje (ordem).
    const inicioDoDiaRedistrib = new Date()
    inicioDoDiaRedistrib.setHours(0, 0, 0, 0)
    const [ticketCountsRes, recebidosHojeRes] = await Promise.all([
      supabase
        .from('tickets')
        .select('colaborador_id')
        .in('colaborador_id', colaboradorIds)
        .in('status', ['aberto', 'em_atendimento']),
      supabase
        .from('tickets')
        .select('colaborador_id')
        .in('colaborador_id', colaboradorIds)
        .gte('criado_em', inicioDoDiaRedistrib.toISOString()),
    ])

    const countMap: Record<string, number> = {}
    ticketCountsRes.data?.forEach(t => {
      if (t.colaborador_id) {
        countMap[t.colaborador_id] = (countMap[t.colaborador_id] || 0) + 1
      }
    })
    const recebidosHojeMap: Record<string, number> = {}
    recebidosHojeRes.data?.forEach(t => {
      if (t.colaborador_id) {
        recebidosHojeMap[t.colaborador_id] = (recebidosHojeMap[t.colaborador_id] || 0) + 1
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
      // Mesma regra dos outros caminhos: ordem por volume recebido hoje, teto
      // por tickets abertos.
      const sorted = ordenarPorEquilibrio(
        eligibleColaboradores.map((c) => ({
          id: c.id,
          ticketsAbertos: countMap[c.id] || 0,
          recebidosHoje: recebidosHojeMap[c.id] || 0,
          ultimaAtribuicaoEm: lastReceivedMap[c.id] || null,
        })),
        maxTicketsPerAgent,
      ).map((c: { id: string; ticketsAbertos: number }) => ({ id: c.id, count: c.ticketsAbertos }))

      for (const candidate of sorted) {
        const { data: result, error: rpcError } = await supabase.rpc('try_atomic_assign_ticket', {
          p_ticket_id: ticket.id,
          p_colaborador_id: candidate.id,
          p_max_tickets: maxTicketsPerAgent,
        })

        if (rpcError) {
          console.error(`[redistribuirTicketsPendentes] RPC falhou para ${candidate.id}:`, rpcError)
          continue
        }

        const assigned = (result as any)?.assigned === true

        if (assigned) {
          await marcarSaidaDaFila(supabase, ticket.id)
          // Atualiza os contadores em memória para a ordenação do PRÓXIMO ticket
          // deste mesmo lote. Sem incrementar `recebidosHojeMap` — que é o
          // critério de ordem — o lote inteiro iria para a mesma pessoa até ela
          // bater no teto, que é justamente o oposto de equilibrar.
          countMap[candidate.id] = (countMap[candidate.id] || 0) + 1
          recebidosHojeMap[candidate.id] = (recebidosHojeMap[candidate.id] || 0) + 1
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
