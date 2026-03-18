import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { criarEDistribuirTicket } from '@/lib/ticket-distribution'

/**
 * POST /api/tickets/disparo-externo
 *
 * Endpoint para uso externo (n8n, bots, integrações).
 * Cria cliente (se necessário), cria ticket com distribuição automática round-robin,
 * e envia a mensagem via Evolution API.
 *
 * Body (JSON):
 *   setor_id        (obrigatório) — UUID do setor
 *   subsetor_id     (opcional)    — UUID do subsetor para roteamento
 *   mensagem        (obrigatório) — texto a enviar via WhatsApp
 *   telefone        (obrigatório) — telefone do cliente (com ou sem DDI 55)
 *   nome            (opcional)    — nome do cliente (default: "Desconhecido")
 *   cliente_id      (opcional)    — se já souber o UUID do cliente, pule a busca
 *   cnpj            (opcional)    — CNPJ do cliente
 *   registro        (opcional)    — código Registro do cliente
 *   canal           (opcional)    — default "whatsapp"
 *
 * Resposta:
 *   { success, ticket_id, ticket_numero, cliente_id, colaborador_id,
 *     evolution_message_id, distribuido }
 */

const EVOLUTION_BASE_URL = 'https://whatsapi.mensageria.softcomtecnologia.com'
const EVOLUTION_GLOBAL_API_KEY =
  'duukhYWkWdrmqcREwVqdNumyokmudpPEUuN4B70YqyQrxL5212IfXWUFYCHfejvTGBw4fc378VGMmUcpF7549ktNWMrnjMF8HBmYxHM9xzhItqPlINrmejamx77FPF8d'

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient()
    const body = await request.json()

    const {
      setor_id,
      subsetor_id = null,
      mensagem,
      telefone,
      nome = 'Desconhecido',
      cliente_id: clienteIdInput = null,
      cnpj = null,
      registro = null,
      canal = 'whatsapp',
    } = body

    // ─── Validação ────────────────────────────────────────────────────────────
    if (!setor_id) {
      return NextResponse.json({ error: 'setor_id é obrigatório' }, { status: 400 })
    }
    if (!mensagem) {
      return NextResponse.json({ error: 'mensagem é obrigatória' }, { status: 400 })
    }
    if (!telefone && !clienteIdInput) {
      return NextResponse.json({ error: 'telefone ou cliente_id é obrigatório' }, { status: 400 })
    }

    // ─── Formatar telefone ────────────────────────────────────────────────────
    const phoneDigits = telefone ? telefone.replace(/\D/g, '') : ''
    const formattedPhone = phoneDigits.length === 11
      ? `55${phoneDigits}`
      : phoneDigits.length === 13 && phoneDigits.startsWith('55')
        ? phoneDigits
        : phoneDigits

    // ─── Buscar ou criar cliente ──────────────────────────────────────────────
    let clienteId = clienteIdInput

    if (!clienteId && formattedPhone) {
      // Tentar encontrar por telefone
      const { data: existingCliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('telefone', formattedPhone)
        .maybeSingle()

      if (existingCliente) {
        clienteId = existingCliente.id

        // Atualizar dados complementares se fornecidos
        const updateData: Record<string, string> = {}
        if (nome && nome !== 'Desconhecido') updateData.nome = nome
        if (cnpj) updateData.CNPJ = cnpj.replace(/\D/g, '')
        if (registro) updateData.Registro = registro

        if (Object.keys(updateData).length > 0) {
          await supabase.from('clientes').update(updateData).eq('id', clienteId)
        }
      } else {
        // Criar novo cliente
        const { data: newCliente, error: clienteError } = await supabase
          .from('clientes')
          .insert({
            nome,
            telefone: formattedPhone,
            CNPJ: cnpj ? cnpj.replace(/\D/g, '') : null,
            Registro: registro || null,
          })
          .select('id')
          .single()

        if (clienteError || !newCliente) {
          console.error('[Disparo Externo] Erro ao criar cliente:', clienteError)
          return NextResponse.json(
            { error: 'Erro ao criar cliente', details: clienteError?.message },
            { status: 500 },
          )
        }
        clienteId = newCliente.id
      }
    }

    if (!clienteId) {
      return NextResponse.json({ error: 'Não foi possível resolver o cliente' }, { status: 400 })
    }

    // ─── Verificar ticket aberto existente ────────────────────────────────────
    const { data: existingTicket } = await supabase
      .from('tickets')
      .select('id, numero, colaborador_id')
      .eq('cliente_id', clienteId)
      .eq('setor_id', setor_id)
      .in('status', ['aberto', 'em_atendimento'])
      .maybeSingle()

    let ticketId: string
    let ticketNumero: number | null = null
    let colaboradorId: string | null = null
    let distribuido = false

    if (existingTicket) {
      // Reusar ticket existente
      ticketId = existingTicket.id
      ticketNumero = existingTicket.numero
      colaboradorId = existingTicket.colaborador_id
    } else {
      // Criar ticket com distribuição automática (round-robin)
      console.log(`[Disparo Externo] Criando ticket — cliente: ${clienteId}, setor: ${setor_id}, subsetor: ${subsetor_id || 'none'}, canal: ${canal}`)
      const result = await criarEDistribuirTicket(clienteId, setor_id, canal, subsetor_id)

      if (!result) {
        console.error(`[Disparo Externo] criarEDistribuirTicket retornou null — cliente: ${clienteId}, setor: ${setor_id}`)
        return NextResponse.json(
          { error: 'Erro ao criar ticket', hint: 'Verifique os logs do servidor para detalhes. Possíveis causas: setor_id inválido, subsetor_id inválido, ou coluna inexistente na tabela tickets.' },
          { status: 500 },
        )
      }

      ticketId = result.ticketId
      colaboradorId = result.colaboradorId
      distribuido = !!colaboradorId

      // Buscar numero do ticket criado
      const { data: ticketData } = await supabase
        .from('tickets')
        .select('numero')
        .eq('id', ticketId)
        .single()
      ticketNumero = ticketData?.numero || null

      console.log(
        `[Disparo Externo] Ticket #${ticketNumero} criado — setor: ${setor_id}, subsetor: ${subsetor_id || 'none'}, atribuído a: ${colaboradorId || 'fila'}`
      )
    }

    // ─── Buscar instância Evolution do setor ──────────────────────────────────
    const { data: canalEvolution } = await supabase
      .from('setor_canais')
      .select('evolution_base_url, evolution_api_key, instancia')
      .eq('setor_id', setor_id)
      .eq('tipo', 'evolution_api')
      .eq('ativo', true)
      .order('criado_em', { ascending: true })
      .limit(1)
      .maybeSingle()

    const evolutionBaseUrl = canalEvolution?.evolution_base_url
      || process.env.EVOLUTION_BASE_URL
      || EVOLUTION_BASE_URL
    const evolutionApiKey = canalEvolution?.evolution_api_key
      || process.env.EVOLUTION_GLOBAL_API_KEY
      || EVOLUTION_GLOBAL_API_KEY
    const instanceName = canalEvolution?.instancia

    if (!instanceName) {
      return NextResponse.json(
        {
          error: 'Nenhuma instância Evolution configurada e ativa neste setor',
          ticket_id: ticketId,
          ticket_numero: ticketNumero,
        },
        { status: 400 },
      )
    }

    // ─── Enviar mensagem via Evolution API ────────────────────────────────────
    const baseUrl = evolutionBaseUrl.replace(/\/+$/, '')
    const evolutionUrl = `${baseUrl}/message/sendText/${instanceName}`

    const evolutionResponse = await fetch(evolutionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionApiKey,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: mensagem,
        delay: 1000,
      }),
    })

    const evolutionData = await evolutionResponse.json()

    if (!evolutionResponse.ok) {
      console.error('[Disparo Externo] Evolution API error:', evolutionData)
      return NextResponse.json(
        {
          error: 'Erro ao enviar mensagem via Evolution API',
          details: evolutionData,
          ticket_id: ticketId,
          ticket_numero: ticketNumero,
        },
        { status: evolutionResponse.status },
      )
    }

    const evolutionMessageId =
      evolutionData?.key?.id ||
      evolutionData?.message?.key?.id ||
      null

    // ─── Atualizar telefone canônico do cliente (se @s.whatsapp.net) ──────────
    const remoteJid: string | undefined =
      evolutionData?.key?.remoteJid ||
      evolutionData?.message?.key?.remoteJid

    if (remoteJid && remoteJid.endsWith('@s.whatsapp.net')) {
      const canonicalPhone = remoteJid.replace('@s.whatsapp.net', '')
      if (canonicalPhone && canonicalPhone !== formattedPhone) {
        await supabase.from('clientes').update({ telefone: canonicalPhone }).eq('id', clienteId)
        console.log(`[Disparo Externo] Telefone atualizado: ${formattedPhone} → ${canonicalPhone}`)
      }
    }

    // ─── Salvar mensagem no banco ─────────────────────────────────────────────
    await supabase.from('mensagens').insert({
      ticket_id: ticketId,
      remetente: 'bot',
      conteudo: mensagem,
      tipo: 'texto',
      phone_number_id: instanceName,
      canal_envio: 'evolutionapi',
      whatsapp_message_id: evolutionMessageId,
      enviado_em: new Date().toISOString(),
    })

    // ─── Salvar log de disparo ────────────────────────────────────────────────
    await supabase.from('disparo_logs').insert({
      setor_id: setor_id,
      colaborador_id: colaboradorId,
      ticket_id: ticketId,
      cliente_nome: nome,
      cliente_telefone: formattedPhone,
      template_usado: `[Externo] ${mensagem.slice(0, 60)}${mensagem.length > 60 ? '...' : ''}`,
      status: 'enviado',
    })

    // ─── Resposta ─────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      ticket_id: ticketId,
      ticket_numero: ticketNumero,
      cliente_id: clienteId,
      colaborador_id: colaboradorId,
      distribuido,
      evolution_message_id: evolutionMessageId,
    })
  } catch (error: any) {
    console.error('[Disparo Externo] Erro:', error)
    return NextResponse.json(
      { error: 'Erro interno', details: error?.message },
      { status: 500 },
    )
  }
}
