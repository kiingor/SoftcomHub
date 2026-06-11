import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { criarEDistribuirTicket } from '@/lib/ticket-distribution'

const NEXUS_REMETENTES = ['cliente-nexus', 'bot-nexus']

/**
 * POST /api/nexus/abrir-ticket
 *
 * Abre um ticket "na marra" para uma conversa que está presa no bot do Nexus.
 * Cria e distribui o ticket (service role, bypassa RLS) e vincula o histórico
 * do bot (mensagens cliente-nexus/bot-nexus sem ticket) ao ticket criado, para
 * que o atendente veja a conversa anterior. Se já houver ticket aberto para o
 * cliente no setor, reutiliza em vez de duplicar.
 *
 * Body: { clienteId?: string, telefone?: string, setorId: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Só atendente autenticado pode forçar abertura de ticket.
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const supabase = createServiceClient()
    const body = await request.json()
    const { clienteId, telefone, setorId, subsetorId } = body as {
      clienteId?: string | null
      telefone?: string | null
      setorId?: string
      subsetorId?: string | null
    }

    if (!setorId) {
      return NextResponse.json({ error: 'setorId é obrigatório' }, { status: 400 })
    }

    // Resolve o cliente: usa clienteId direto, senão acha pelo telefone.
    let resolvedClienteId = clienteId || null
    if (!resolvedClienteId && telefone) {
      const { data: clientePorTelefone } = await supabase
        .from('clientes')
        .select('id')
        .eq('telefone', telefone)
        .limit(1)
        .maybeSingle()
      resolvedClienteId = clientePorTelefone?.id || null
    }

    if (!resolvedClienteId) {
      return NextResponse.json({ error: 'clienteId ou telefone válido é obrigatório' }, { status: 400 })
    }

    // Agrupa todos os cliente_ids com o mesmo telefone — o bot pode ter gravado
    // a conversa em registros de cliente distintos com o mesmo número.
    let clienteIds = [resolvedClienteId]
    const { data: clienteData } = await supabase
      .from('clientes')
      .select('telefone')
      .eq('id', resolvedClienteId)
      .single()

    if (clienteData?.telefone) {
      const { data: mesmosTelefone } = await supabase
        .from('clientes')
        .select('id')
        .eq('telefone', clienteData.telefone)
      if (mesmosTelefone && mesmosTelefone.length > 0) {
        clienteIds = [...new Set(mesmosTelefone.map((c) => c.id))]
      }
    }

    // Evita duplicar: reusa ticket aberto/em atendimento do cliente neste setor.
    const { data: ticketExistente } = await supabase
      .from('tickets')
      .select('id, colaborador_id')
      .in('cliente_id', clienteIds)
      .eq('setor_id', setorId)
      .in('status', ['aberto', 'em_atendimento'])
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()

    let ticketId: string
    let colaboradorId: string | null
    const jaExistia = Boolean(ticketExistente)

    if (ticketExistente) {
      ticketId = ticketExistente.id
      colaboradorId = ticketExistente.colaborador_id
    } else {
      const result = await criarEDistribuirTicket(resolvedClienteId, setorId, 'whatsapp', subsetorId || null)
      if (!result) {
        return NextResponse.json({ error: 'Falha ao criar o ticket' }, { status: 500 })
      }
      ticketId = result.ticketId
      colaboradorId = result.colaboradorId
    }

    // Vincula o histórico do bot ao ticket para o atendente ver a conversa.
    const { error: linkError, count } = await supabase
      .from('mensagens')
      .update({ ticket_id: ticketId }, { count: 'exact' })
      .in('cliente_id', clienteIds)
      .is('ticket_id', null)
      .in('remetente', NEXUS_REMETENTES)

    if (linkError) {
      console.error('[nexus/abrir-ticket] Falha ao vincular mensagens do bot:', linkError.message)
    }

    // Nome do atendente atribuído (se houver) para feedback na UI.
    let colaboradorNome: string | null = null
    if (colaboradorId) {
      const { data: colab } = await supabase
        .from('colaboradores')
        .select('nome')
        .eq('id', colaboradorId)
        .maybeSingle()
      colaboradorNome = colab?.nome || null
    }

    return NextResponse.json({
      success: true,
      ticketId,
      colaboradorId,
      colaboradorNome,
      jaExistia,
      mensagensVinculadas: count ?? 0,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 })
  }
}
