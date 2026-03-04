import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { ticketId, evento } = body

    if (!ticketId || !evento) {
      return NextResponse.json(
        { error: 'Missing required fields: ticketId, evento' },
        { status: 400 },
      )
    }

    // Fetch ticket with client and setor data
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select(`
        id,
        numero,
        status,
        prioridade,
        canal,
        setor_id,
        colaborador_id,
        cliente_id,
        criado_em,
        encerrado_em,
        primeira_resposta_em,
        user_name_discord,
        clientes (
          id,
          nome,
          telefone,
          email,
          Registro,
          CNPJ,
          PDV
        )
      `)
      .eq('id', ticketId)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json(
        { error: 'Ticket nao encontrado', details: ticketError?.message || 'No data returned' },
        { status: 404 },
      )
    }

    // Fetch setor with webhook config
    const { data: setor } = await supabase
      .from('setores')
      .select('id, nome, canal, webhook_url, webhook_eventos')
      .eq('id', ticket.setor_id)
      .single()

    if (!setor?.webhook_url || !setor?.webhook_eventos?.length) {
      return NextResponse.json({ skipped: true, reason: 'Webhook nao configurado neste setor' })
    }

    // Check if this event is enabled
    if (!setor.webhook_eventos.includes(evento)) {
      return NextResponse.json({ skipped: true, reason: `Evento "${evento}" nao habilitado neste setor` })
    }

    // Fetch colaborador name if assigned
    let colaboradorNome = null
    if (ticket.colaborador_id) {
      const { data: colab } = await supabase
        .from('colaboradores')
        .select('nome')
        .eq('id', ticket.colaborador_id)
        .single()
      colaboradorNome = colab?.nome || null
    }

    // Build webhook payload
    const payload = {
      evento,
      timestamp: new Date().toISOString(),
      ticket: {
        id: ticket.id,
        numero: ticket.numero,
        status: ticket.status,
        prioridade: ticket.prioridade,
        canal: ticket.canal || setor.canal,
        setor: {
          id: setor.id,
          nome: setor.nome,
        },
        atendente: colaboradorNome
          ? { id: ticket.colaborador_id, nome: colaboradorNome }
          : null,
        criado_em: ticket.criado_em,
        primeira_resposta_em: ticket.primeira_resposta_em,
        encerrado_em: ticket.encerrado_em,
        user_name_discord: ticket.user_name_discord || null,
      },
      cliente: {
        id: (ticket.clientes as any)?.id || null,
        nome: (ticket.clientes as any)?.nome || null,
        telefone: (ticket.clientes as any)?.telefone || null,
        email: (ticket.clientes as any)?.email || null,
        registro: (ticket.clientes as any)?.Registro || null,
        cnpj: (ticket.clientes as any)?.CNPJ || null,
        pdv: (ticket.clientes as any)?.PDV || null,
      },
    }

    // Fire webhook (fire-and-forget with timeout)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

    try {
      const webhookResponse = await fetch(setor.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AtendimentoWebhook/1.0',
          'X-Webhook-Event': evento,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      return NextResponse.json({
        success: true,
        webhookStatus: webhookResponse.status,
        evento,
        ticketId: ticket.id,
      })
    } catch (fetchError: any) {
      clearTimeout(timeout)
      console.error('[Webhook] Failed to dispatch:', fetchError.message)
      return NextResponse.json({
        success: false,
        error: `Webhook dispatch failed: ${fetchError.message}`,
        evento,
        ticketId: ticket.id,
      })
    }
  } catch (error: any) {
    console.error('[Webhook] Route error:', error)
    return NextResponse.json(
      { error: error.message || 'Erro interno' },
      { status: 500 },
    )
  }
}
