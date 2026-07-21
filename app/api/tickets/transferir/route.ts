import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { processTicketQueue } from '@/lib/ticket-queue-processor'

/**
 * POST /api/tickets/transferir
 *
 * Transfere um ticket respeitando o limite max_tickets_per_agent do setor destino.
 * Se o atendente alvo estiver no limite, o ticket vai para a fila (colaborador_id = null).
 *
 * Body params:
 * - ticket_id: string (obrigatório)
 * - setor_id: string (opcional) — novo setor destino
 * - subsetor_id: string (opcional) — fila do subsetor no setor destino
 * - colaborador_id: string | null (opcional) — atendente destino; null = fila
 * - from_colaborador_nome: string (opcional) — nome de quem transferiu (para mensagem do sistema)
 * - from_setor_nome: string (opcional) — nome do setor de origem (para mensagem do sistema)
 */
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const {
      ticket_id,
      setor_id,
      subsetor_id,
      colaborador_id,
    } = body

    if (!ticket_id) {
      return NextResponse.json({ error: 'ticket_id é obrigatório' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: actor, error: actorError } = await supabase
      .from('colaboradores')
      .select('id, nome, ativo, is_master')
      .eq('email', user.email)
      .maybeSingle()

    if (actorError || !actor?.ativo) {
      return NextResponse.json({ error: 'Colaborador não autorizado' }, { status: 403 })
    }

    // 1. Buscar ticket atual
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, setor_id, subsetor_id, colaborador_id, cliente_id, status, setores!tickets_setor_id_fkey(nome)')
      .eq('id', ticket_id)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
    }

    const canTransferAnyTicket = actor.is_master === true
    if (ticket.colaborador_id !== actor.id && !canTransferAnyTicket) {
      return NextResponse.json({ error: 'Você não pode transferir este ticket' }, { status: 403 })
    }
    if (!['aberto', 'em_atendimento'].includes(ticket.status)) {
      return NextResponse.json({ error: 'Somente tickets ativos podem ser transferidos' }, { status: 409 })
    }

    const targetSetorId = setor_id || ticket.setor_id

    let targetSubsetor: { id: string; nome: string } | null = null
    if (subsetor_id) {
      const { data: subsetor, error: subsetorError } = await supabase
        .from('subsetores')
        .select('id, nome, setor_id, ativo')
        .eq('id', subsetor_id)
        .maybeSingle()

      if (subsetorError || !subsetor || !subsetor.ativo || subsetor.setor_id !== targetSetorId) {
        return NextResponse.json(
          { error: 'Subsetor não encontrado, inativo ou não pertence ao setor de destino.' },
          { status: 422 },
        )
      }

      targetSubsetor = { id: subsetor.id, nome: subsetor.nome }
    }

    let queued = false
    let toColabNome = 'Aguardando atendente'
    let finalColaboradorId: string | null = null

    // Validar atendente destino antes de liberar o ticket.
    // Atendente OFFLINE é permitido: o operador pode transferir deliberadamente
    // (confirmado na UI). A atribuição é FORÇADA — ignora o limite de tickets — e o
    // ticket fica na lista (chat) do atendente, que o vê mesmo em status offline.
    let colabDestino: { id: string; nome: string } | null = null
    let forceOffline = false
    if (colaborador_id && !targetSubsetor) {
      const [{ data: colab }, { data: setorLink }] = await Promise.all([
        supabase
        .from('colaboradores')
        .select('id, nome, is_online, ativo, pausa_atual_id')
        .eq('id', colaborador_id)
        .maybeSingle(),
        supabase
          .from('colaboradores_setores')
          .select('colaborador_id')
          .eq('colaborador_id', colaborador_id)
          .eq('setor_id', targetSetorId)
          .maybeSingle(),
      ])

      if (!colab || !colab.ativo || !setorLink) {
        return NextResponse.json(
          { error: 'Atendente não encontrado, inativo ou fora do setor de destino.' },
          { status: 422 }
        )
      }

      forceOffline = !colab.is_online

      // Pausa só bloqueia atendente ONLINE. Offline é permitido (atribuição forçada).
      if (!forceOffline && colab.pausa_atual_id) {
        return NextResponse.json(
          { error: 'Este atendente está em pausa. Selecione outro atendente.' },
          { status: 422 }
        )
      }

      // Nota: heartbeat NÃO é verificado em transferências manuais.
      // A verificação de heartbeat é reservada para distribuição automática.

      colabDestino = { id: colab.id, nome: colab.nome }
    }

    // Etapa 1: liberar o ticket (colaborador_id = null, status = aberto) e, se houver,
    // trocar setor/subsetor. Isso deixa o ticket em estado "disponível" para a RPC
    // atômica atribuí-lo a seguir. Se não houver atendente destino, o ticket já fica
    // pronto na fila.
    const releaseData: Record<string, unknown> = {
      colaborador_id: null,
      status: 'aberto',
    }
    if (setor_id || targetSubsetor) {
      releaseData.setor_id = targetSetorId
    }
    if (targetSubsetor) {
      releaseData.subsetor_id = targetSubsetor.id
    } else if (setor_id) {
      // Limpar subsetor ao transferir entre setores — o subsetor antigo não existe no novo setor.
      releaseData.subsetor_id = null
    }

    let releaseQuery = supabase
      .from('tickets')
      .update(releaseData)
      .eq('id', ticket_id)
    releaseQuery = ticket.colaborador_id
      ? releaseQuery.eq('colaborador_id', ticket.colaborador_id)
      : releaseQuery.is('colaborador_id', null)

    const { data: releasedTicket, error: releaseError } = await releaseQuery
      .select('id')
      .maybeSingle()

    if (releaseError || !releasedTicket) {
      console.error('[Transferir] Erro ao atualizar ticket:', releaseError)
      return NextResponse.json(
        { error: releaseError ? 'Erro ao transferir ticket' : 'O ticket foi alterado por outro processo' },
        { status: releaseError ? 500 : 409 },
      )
    }

    // Etapa 2: havendo atendente destino, atribuição atômica via RPC.
    // Transferência direta FORÇA a atribuição (ignora o limite). A RPC só recusa
    // em caso de corrida (ticket já atribuído por outro processo) → cai na fila.
    if (colabDestino) {
      // Transferência manual direta: atribuição FORÇADA ao atendente escolhido,
      // ignorando o limite de tickets — vale tanto para atendente online no limite
      // quanto para offline. O ticket aguarda na lista (chat) dele.
      const maxTicketsPerAgent = 1_000_000

      const { data: result, error: rpcError } = await supabase.rpc('try_atomic_assign_ticket', {
        p_ticket_id: ticket_id,
        p_colaborador_id: colabDestino.id,
        p_max_tickets: maxTicketsPerAgent,
      })

      if (rpcError) {
        console.error('[Transferir] RPC try_atomic_assign_ticket falhou:', rpcError)
        queued = true
        toColabNome = 'Fila de espera'
      } else if ((result as any)?.assigned === true) {
        finalColaboradorId = colabDestino.id
        toColabNome = colabDestino.nome
      } else {
        // Atendente no limite ou conflito → fica em fila
        queued = true
        toColabNome = 'Fila de espera'
        console.log(
          `[Transferir] Atendente ${colabDestino.nome} recusado (${(result as any)?.reason}, count=${(result as any)?.current_count}/${maxTicketsPerAgent}) — ticket ${ticket_id} vai para fila`
        )
      }
    } else {
      queued = true
      if (targetSubsetor) {
        toColabNome = `Fila do subsetor ${targetSubsetor.nome}`
      }
    }

    // 6. Buscar nome do setor destino para a mensagem
    let toSetorNome = (ticket.setores as any)?.nome || 'Desconhecido'
    if (setor_id) {
      const { data: setor } = await supabase
        .from('setores')
        .select('nome')
        .eq('id', setor_id)
        .single()
      toSetorNome = setor?.nome || toSetorNome
    } else {
      toSetorNome = (ticket.setores as any)?.nome || toSetorNome
    }

    // 7. Inserir mensagem de sistema com log de transferência
    const fromNome = actor.nome || 'Desconhecido'
    const fromSetor = (ticket.setores as any)?.nome || 'Desconhecido'
    const destinoNome = targetSubsetor
      ? `${toSetorNome} / ${targetSubsetor.nome}`
      : toSetorNome
    const conteudo = `Transferido de ${fromNome} - ${fromSetor} >> ${toColabNome} - ${destinoNome}`

    await supabase.from('mensagens').insert({
      ticket_id,
      cliente_id: ticket.cliente_id,
      remetente: 'sistema',
      conteudo,
      tipo: 'texto',
      enviado_em: new Date().toISOString(),
    })

    // 7b. Registrar em ticket_logs pra aparecer no histórico de "origem".
    // Formato padronizado pro helper lib/ticket-origem.ts parsear:
    //   "Transferido por <NOME>: <SETOR_ORIGEM> → <SETOR_DESTINO>"
    const descricaoLog = `Transferido por ${fromNome}: ${fromSetor} → ${destinoNome}${
      colabDestino ? ` (para ${colabDestino.nome})` : queued ? ' (fila)' : ''
    }`
    const { error: logTransfError } = await supabase.from('ticket_logs').insert({
      ticket_id,
      tipo: 'transferencia',
      descricao: descricaoLog,
    })
    if (logTransfError) {
      console.warn('[Transferir] Falha ao gravar log de transferência:', logTransfError.message)
    }

    // 8. Se o ticket foi para a fila, acionar distribuição automática
    if (queued) {
      processTicketQueue().catch((err) => {
        console.error('[Transferir] Erro ao processar fila após transferência:', err)
      })
    }

    return NextResponse.json({
      success: true,
      queued,
      message: targetSubsetor
        ? `Ticket transferido para a fila do subsetor ${targetSubsetor.nome}`
        : queued
        ? 'Ticket transferido para a fila — atendente no limite de tickets'
        : 'Ticket transferido com sucesso',
      colaborador_id: finalColaboradorId,
      setor_id: targetSetorId,
      subsetor_id: targetSubsetor?.id ?? (setor_id ? null : ticket.subsetor_id),
      subsetor_nome: targetSubsetor?.nome ?? null,
    })
  } catch (error) {
    console.error('[Transferir] Erro inesperado:', error)
    return NextResponse.json(
      { error: 'Erro interno', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
