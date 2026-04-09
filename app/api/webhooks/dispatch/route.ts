import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Format milliseconds into human-readable duration
function formatDuration(ms: number): string {
  if (ms < 0) return '—'
  const totalSeconds = Math.floor(ms / 1000)
  const hours   = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}min ${seconds}s`
  if (minutes > 0) return `${minutes}min ${seconds}s`
  return `${seconds}s`
}

// Format ISO date to Brazilian locale string
function formatBR(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch {
    return iso
  }
}

export async function POST(request: Request) {
  try {
    // Use service role to bypass RLS — webhooks are internal server calls
    const supabase = createServiceClient()
    const body = await request.json()
    const { ticketId, evento } = body

    if (!ticketId || !evento) {
      return NextResponse.json(
        { error: 'Missing required fields: ticketId, evento' },
        { status: 400 },
      )
    }

    // Fetch ticket with full relational data
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
        subsetor_id,
        user_name_discord,
        clientes (
          id,
          nome,
          telefone,
          email,
          Registro,
          CNPJ,
          PDV
        ),
        subsetores (
          id,
          nome
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
      .select('id, nome, canal, webhook_url, webhook_eventos, phone_number_id')
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
    let colaboradorNome: string | null = null
    let colaboradorSuporteId: string | null = null
    if (ticket.colaborador_id) {
      const { data: colab } = await supabase
        .from('colaboradores')
        .select('nome, suporte_id')
        .eq('id', ticket.colaborador_id)
        .single()
      colaboradorNome = colab?.nome || null
      colaboradorSuporteId = colab?.suporte_id || null
    }

    // Fetch all messages for this ticket (conversation history)
    const { data: mensagens } = await supabase
      .from('mensagens')
      .select('id, remetente, conteudo, tipo, url_imagem, media_type, enviado_em, canal_envio')
      .eq('ticket_id', ticketId)
      .order('enviado_em', { ascending: true })

    // ─── Build metrics ────────────────────────────────────────────────────────
    const criadoEm   = ticket.criado_em   ? new Date(ticket.criado_em).getTime()   : null
    const encerradoEm= ticket.encerrado_em? new Date(ticket.encerrado_em).getTime(): null
    const primeiraRespEm = ticket.primeira_resposta_em
      ? new Date(ticket.primeira_resposta_em).getTime()
      : null

    const duracaoTotalMs       = criadoEm && encerradoEm  ? encerradoEm - criadoEm        : null
    const tempoPrimeiraRespMs  = criadoEm && primeiraRespEm? primeiraRespEm - criadoEm    : null

    const msgLista = mensagens || []
    const msgCliente     = msgLista.filter(m => m.remetente === 'cliente')
    const msgColaborador = msgLista.filter(m => m.remetente === 'colaborador' || m.remetente === 'bot')
    const msgSistema     = msgLista.filter(m => m.remetente === 'sistema')

    // ─── Build conversation history ───────────────────────────────────────────
    const conversa = msgLista.map((m, idx) => {
      const enviadoEm = m.enviado_em ? new Date(m.enviado_em).getTime() : null
      const anterior  = idx > 0 && msgLista[idx - 1].enviado_em
        ? new Date(msgLista[idx - 1].enviado_em).getTime()
        : null

      const intervaloAnteriorMs = enviadoEm && anterior ? enviadoEm - anterior : null

      const item: Record<string, any> = {
        sequencia:           idx + 1,
        remetente:           m.remetente,
        tipo:                m.tipo || 'texto',
        conteudo:            m.conteudo || null,
        url_midia:           m.url_imagem || null,
        mime_type:           m.media_type || null,
        canal_envio:         m.canal_envio || null,
        enviado_em_iso:      m.enviado_em || null,
        enviado_em_br:       formatBR(m.enviado_em),
        intervalo_anterior:  intervaloAnteriorMs !== null ? formatDuration(intervaloAnteriorMs) : null,
        intervalo_anterior_segundos: intervaloAnteriorMs !== null ? Math.round(intervaloAnteriorMs / 1000) : null,
      }
      return item
    })

    // ─── Build webhook payload ────────────────────────────────────────────────
    const payload = {
      evento,
      timestamp:     new Date().toISOString(),
      timestamp_br:  formatBR(new Date().toISOString()),

      ticket: {
        id:         ticket.id,
        numero:     ticket.numero,
        status:     ticket.status,
        prioridade: ticket.prioridade,
        canal:      ticket.canal || setor.canal,
        phone_number_id: setor.phone_number_id || null,

        setor: {
          id:   setor.id,
          nome: setor.nome,
        },
        subsetor: ticket.subsetor_id
          ? { id: (ticket.subsetores as any)?.id, nome: (ticket.subsetores as any)?.nome }
          : null,

        atendente: colaboradorNome
          ? { id: ticket.colaborador_id, nome: colaboradorNome, suporte_id: colaboradorSuporteId }
          : null,

        // Timestamps ISO + BR
        criado_em:             ticket.criado_em || null,
        criado_em_br:          formatBR(ticket.criado_em),
        primeira_resposta_em:  ticket.primeira_resposta_em || null,
        primeira_resposta_em_br: formatBR(ticket.primeira_resposta_em),
        encerrado_em:          ticket.encerrado_em || null,
        encerrado_em_br:       formatBR(ticket.encerrado_em),

        user_name_discord: ticket.user_name_discord || null,
      },

      cliente: {
        id:       (ticket.clientes as any)?.id       || null,
        nome:     (ticket.clientes as any)?.nome      || null,
        telefone: (ticket.clientes as any)?.telefone  || null,
        email:    (ticket.clientes as any)?.email     || null,
        registro: (ticket.clientes as any)?.Registro  || null,
        cnpj:     (ticket.clientes as any)?.CNPJ      || null,
        pdv:      (ticket.clientes as any)?.PDV        || null,
      },

      metricas: {
        duracao_total:              duracaoTotalMs !== null ? formatDuration(duracaoTotalMs)      : null,
        duracao_total_segundos:     duracaoTotalMs !== null ? Math.round(duracaoTotalMs / 1000)   : null,
        tempo_primeira_resposta:    tempoPrimeiraRespMs !== null ? formatDuration(tempoPrimeiraRespMs)    : null,
        tempo_primeira_resposta_segundos: tempoPrimeiraRespMs !== null ? Math.round(tempoPrimeiraRespMs / 1000) : null,
        total_mensagens:            msgLista.length,
        mensagens_cliente:          msgCliente.length,
        mensagens_colaborador:      msgColaborador.length,
        mensagens_sistema:          msgSistema.length,
      },

      historico_conversa: conversa,
    }

    // Fire webhook with 10s timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    try {
      const webhookResponse = await fetch(setor.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SoftcomHub-Webhook/1.0',
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
        mensagensEnviadas: msgLista.length,
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
