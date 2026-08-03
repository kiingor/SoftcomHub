import { NextRequest, NextResponse } from 'next/server'
import { buscarSubsetoresDoCriador, escolherSubsetorDoCriador } from '@/lib/disparo-processor'
import { normalizeBrazilianPhone } from '@/lib/phone'
import {
  describeUnexpectedError,
  sanitizeDatabaseError,
  sanitizeEvolutionProviderError,
} from '@/lib/provider-error'
import { resolverSubsetorPadrao } from '@/lib/server/subsetor-padrao-resolver'
import { createClient } from '@/lib/supabase/server'

const EVOLUTION_BASE_URL = 'https://whatsapi.mensageria.softcomtecnologia.com'
const EVOLUTION_GLOBAL_API_KEY =
  'duukhYWkWdrmqcREwVqdNumyokmudpPEUuN4B70YqyQrxL5212IfXWUFYCHfejvTGBw4fc378VGMmUcpF7549ktNWMrnjMF8HBmYxHM9xzhItqPlINrmejamx77FPF8d'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { clienteNome, clienteCnpj, clienteRegistro, telefone, setorId, mensagem } = body

    if (!clienteNome || !telefone || !setorId || !mensagem) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: clienteNome, telefone, setorId, mensagem' },
        { status: 400 },
      )
    }

    // Get colaborador info
    const { data: colaborador } = await supabase
      .from('colaboradores')
      .select('id, nome, setor_id')
      .eq('email', user.email)
      .single()

    if (!colaborador) {
      return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 })
    }

    // Get active Evolution canal for the setor
    const { data: canalEvolution } = await supabase
      .from('setor_canais')
      .select('evolution_base_url, evolution_api_key, instancia')
      .eq('setor_id', setorId)
      .eq('tipo', 'evolution_api')
      .eq('ativo', true)
      .order('criado_em', { ascending: true })
      .limit(1)
      .maybeSingle()

    const evolutionBaseUrl =
      canalEvolution?.evolution_base_url ||
      process.env.EVOLUTION_BASE_URL ||
      EVOLUTION_BASE_URL
    const evolutionApiKey =
      canalEvolution?.evolution_api_key ||
      process.env.EVOLUTION_GLOBAL_API_KEY ||
      EVOLUTION_GLOBAL_API_KEY
    const instanceName = canalEvolution?.instancia

    if (!instanceName) {
      return NextResponse.json(
        { error: 'Nenhuma instância Evolution configurada e ativa neste setor' },
        { status: 400 },
      )
    }

    // Format phone number
    const formattedPhone = normalizeBrazilianPhone(telefone)

    // Find or create cliente
    const cleanCnpj = clienteCnpj?.replace(/\D/g, '') || null

    let clienteId: string

    const { data: existingCliente } = await supabase
      .from('clientes')
      .select('id')
      .eq('telefone', formattedPhone)
      .maybeSingle()

    if (existingCliente) {
      clienteId = existingCliente.id
      await supabase
        .from('clientes')
        .update({
          CNPJ: cleanCnpj || undefined,
          Registro: clienteRegistro || undefined,
          nome: clienteNome,
        })
        .eq('id', clienteId)
    } else {
      const { data: newCliente, error: clienteError } = await supabase
        .from('clientes')
        .insert({
          nome: clienteNome,
          telefone: formattedPhone,
          CNPJ: cleanCnpj,
          Registro: clienteRegistro || null,
        })
        .select('id')
        .single()

      if (clienteError || !newCliente) {
        // O `details` do PostgREST repete a linha recusada — em `clientes` isso
        // é o telefone. Só código e mensagem redigida saem daqui.
        const failure = sanitizeDatabaseError(clienteError)
        console.error('[Evolution Dispatch] Error creating cliente:', failure)
        return NextResponse.json(
          { error: 'Erro ao criar cliente', details: failure },
          { status: 500 },
        )
      }
      clienteId = newCliente.id
    }

    // Check for existing open ticket for this client in this setor
    const { data: existingTicket } = await supabase
      .from('tickets')
      .select('id, numero, colaborador_id, colaboradores(nome)')
      .eq('cliente_id', clienteId)
      .eq('setor_id', setorId)
      .in('status', ['aberto', 'em_atendimento'])
      .maybeSingle()

    let ticketId: string
    let ticketNumero: number | null = null

    if (existingTicket) {
      const atendenteName = (existingTicket as any)?.colaboradores?.nome || null
      return NextResponse.json({
        success: false,
        warning: 'Ja existe um ticket aberto para este cliente',
        ticketId: existingTicket.id,
        ticketNumero: existingTicket.numero,
        atendente: atendenteName,
      })
    } else {
      // Mesmo caso da rota de disparo por template: o ticket é montado à mão e
      // ficava sem subsetor, o que o deixa fora da distribuição e dos filtros.
      // Herda de quem disparou, ou cai no padrão do setor.
      const subsetorDoDisparo = escolherSubsetorDoCriador(
        await buscarSubsetoresDoCriador(supabase, setorId, colaborador.id),
      ) ?? await resolverSubsetorPadrao(supabase, setorId)

      // Create ticket — no is_disparo flag (agent can reply immediately, no lock)
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          cliente_id: clienteId,
          colaborador_id: colaborador.id,
          setor_id: setorId,
          status: 'em_atendimento',
          prioridade: 'normal',
          canal: 'whatsapp',
          ...(subsetorDoDisparo ? { subsetor_id: subsetorDoDisparo } : {}),
        })
        .select('id, numero')
        .single()

      if (ticketError || !ticket) {
        const failure = sanitizeDatabaseError(ticketError)
        console.error('[Evolution Dispatch] Error creating ticket:', failure)
        return NextResponse.json(
          { error: 'Erro ao criar ticket', details: failure },
          { status: 500 },
        )
      }
      ticketId = ticket.id
      ticketNumero = ticket.numero
    }

    // Send message via EvolutionAPI
    const baseUrl = evolutionBaseUrl.replace(/\/+$/, '')
    const evolutionUrl = `${baseUrl}/message/sendText/${instanceName}`
    const evolutionBody = {
      number: formattedPhone,
      text: mensagem,
      delay: 1000,
    }

    const evolutionResponse = await fetch(evolutionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionApiKey,
      },
      body: JSON.stringify(evolutionBody),
    })

    const evolutionData = await evolutionResponse.json()

    if (!evolutionResponse.ok) {
      const providerDetails = sanitizeEvolutionProviderError(evolutionData, evolutionResponse.status)
      console.error('[Evolution Dispatch] API error:', providerDetails)
      return NextResponse.json(
        { error: 'Erro ao enviar mensagem via EvolutionAPI', details: providerDetails },
        { status: evolutionResponse.status },
      )
    }

    const evolutionMessageId =
      evolutionData?.key?.id ||
      evolutionData?.message?.key?.id ||
      null

    // Extract canonical phone from remoteJid returned by Evolution API
    // Apenas aceita o formato "@s.whatsapp.net" — ignora "@lid" e outros formatos
    // internos do WhatsApp que não representam um número de telefone real.
    // Exemplo válido:   "558399399202@s.whatsapp.net" → "558399399202"
    // Exemplo inválido: "230571745747156@lid"         → ignorado
    const remoteJid: string | undefined =
      evolutionData?.key?.remoteJid ||
      evolutionData?.message?.key?.remoteJid

    if (remoteJid && remoteJid.endsWith('@s.whatsapp.net')) {
      const canonicalPhone = remoteJid.replace('@s.whatsapp.net', '')
      if (canonicalPhone && canonicalPhone !== formattedPhone) {
        await supabase
          .from('clientes')
          .update({ telefone: canonicalPhone })
          .eq('id', clienteId)
        console.log(`[Evolution Dispatch] Telefone canonizado pelo provedor — cliente: ${clienteId}`)
      }
      // Se já é igual, nenhuma atualização necessária
    } else if (remoteJid) {
      // O sufixo é exatamente o que este log existe para dizer (@lid, @g.us…) e
      // é a única parte do JID que não é o número do cliente.
      const formato = remoteJid.includes('@') ? remoteJid.slice(remoteJid.indexOf('@')) : 'sem @'
      console.log(`[Evolution Dispatch] remoteJid ignorado (formato não é @s.whatsapp.net): ${formato}`)
    }

    // Save message in DB as bot message (initial dispatch message)
    const { error: msgError } = await supabase.from('mensagens').insert({
      ticket_id: ticketId,
      remetente: 'bot',
      conteudo: mensagem,
      tipo: 'texto',
      phone_number_id: instanceName,
      canal_envio: 'evolutionapi',
      whatsapp_message_id: evolutionMessageId,
      enviado_em: new Date().toISOString(),
    })

    if (msgError) {
      console.error('[Evolution Dispatch] Error saving message:', sanitizeDatabaseError(msgError))
    }

    // Save dispatch log
    const { error: logError } = await supabase.from('disparo_logs').insert({
      setor_id: setorId,
      colaborador_id: colaborador.id,
      ticket_id: ticketId,
      cliente_nome: clienteNome,
      cliente_telefone: formattedPhone,
      template_usado: `[Evolution] ${mensagem.slice(0, 60)}${mensagem.length > 60 ? '...' : ''}`,
      status: 'enviado',
    })

    if (logError) {
      console.error('[Evolution Dispatch] Error saving disparo_log:', sanitizeDatabaseError(logError))
    }

    return NextResponse.json({
      success: true,
      ticketId,
      ticketNumero,
      clienteId,
    })
  } catch (error) {
    console.error(
      '[Evolution Dispatch] Error:',
      describeUnexpectedError(error, 'Erro interno no disparo'),
    )
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
