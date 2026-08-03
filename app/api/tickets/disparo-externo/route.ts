import { NextRequest, NextResponse } from 'next/server'
import {
  describeUnexpectedError,
  sanitizeDatabaseError,
  sanitizeEvolutionProviderError,
  sanitizeWhatsAppProviderError,
} from '@/lib/provider-error'
import { getWhatsAppProviderAcceptance } from '@/lib/whatsapp-provider-error'
import { createServiceClient } from '@/lib/supabase/service'
import {
  registrarFalhaDeDisparo,
  verificarDestinatarioEvolution,
} from '@/lib/disparo-processor'
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
    let formattedPhone = phoneDigits.length === 11
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
          // O `details` do PostgREST repete a linha recusada — em `clientes`
          // isso é o telefone. Só código e mensagem redigida saem daqui.
          const failure = sanitizeDatabaseError(clienteError)
          console.error('[Disparo Externo] Erro ao criar cliente:', failure)
          return NextResponse.json(
            { error: 'Erro ao criar cliente', details: failure },
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

    let ticketId: string | null = existingTicket?.id || null
    let ticketNumero: number | null = existingTicket?.numero || null
    let colaboradorId: string | null = existingTicket?.colaborador_id || null
    let distribuido = false

    // ─── Buscar canal ativo do setor (Evolution OU API Oficial) ────────────────
    // Tenta qualquer canal ativo — usa o primeiro que encontrar
    const { data: canaisAtivos } = await supabase
      .from('setor_canais')
      .select('id, tipo, instancia, evolution_base_url, evolution_api_key, phone_number_id, whatsapp_token, template_id, template_language')
      .eq('setor_id', setor_id)
      .eq('ativo', true)
      .order('criado_em', { ascending: true })

    // Também buscar config do setor como fallback para API oficial
    const { data: setorConfig } = await supabase
      .from('setores')
      .select('template_id, phone_number_id, template_language, whatsapp_token')
      .eq('id', setor_id)
      .single()

    const canalEvolution = canaisAtivos?.find((c: any) => c.tipo === 'evolution_api' && c.instancia) || null
    const canalOficial = canaisAtivos?.find((c: any) => c.tipo === 'whatsapp' && (c.phone_number_id || setorConfig?.phone_number_id)) || null

    if (!canalEvolution && !canalOficial) {
      return NextResponse.json(
        {
          error: 'Nenhum canal de atendimento (Evolution ou API Oficial) configurado e ativo neste setor',
          ticket_id: ticketId,
          ticket_numero: ticketNumero,
        },
        { status: 400 },
      )
    }

    let messageId: string | null = null
    let canalEnvio: string = 'whatsapp'
    let phoneNumberIdUsed: string | null = null

    // ─── Tentar enviar pelo primeiro canal disponível ─────────────────────────
    if (canalEvolution) {
      // ── EVOLUTION API ── envio de texto direto ──
      const evolutionBaseUrl = (canalEvolution.evolution_base_url || process.env.EVOLUTION_BASE_URL || EVOLUTION_BASE_URL).replace(/\/+$/, '')
      const evolutionApiKey = canalEvolution.evolution_api_key || process.env.EVOLUTION_GLOBAL_API_KEY || EVOLUTION_GLOBAL_API_KEY
      const instanceName = canalEvolution.instancia
      const verificacao = await verificarDestinatarioEvolution(
        {
          baseUrl: evolutionBaseUrl,
          apiKey: evolutionApiKey,
          instanceName,
        },
        formattedPhone,
      )

      if (verificacao.status !== 'available') {
        await registrarFalhaDeDisparo(supabase, {
          setorId: setor_id,
          colaboradorId: null,
          colaboradorNome: 'Integração externa',
          clienteNome: nome,
          clienteTelefone: formattedPhone,
          clienteCnpj: cnpj,
          templateName: `[Externo] ${mensagem.slice(0, 60)}${mensagem.length > 60 ? '...' : ''}`,
        })

        const isRecipientMissing = verificacao.status === 'not_registered'
        return NextResponse.json(
          {
            error: isRecipientMissing
              ? 'O número informado não possui WhatsApp. Nenhum ticket foi criado.'
              : 'Não foi possível validar o número no WhatsApp. Nenhum ticket foi criado.',
            code: isRecipientMissing ? 'RECIPIENT_NOT_ON_WHATSAPP' : 'RECIPIENT_CHECK_UNAVAILABLE',
          },
          { status: isRecipientMissing ? 422 : 502 },
        )
      }

      formattedPhone = verificacao.telefone || formattedPhone

      const evolutionUrl = `${evolutionBaseUrl}/message/sendText/${instanceName}`
      const evolutionResponse = await fetch(evolutionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionApiKey },
        body: JSON.stringify({ number: formattedPhone, text: mensagem, delay: 1000 }),
      })
      const evolutionData = await evolutionResponse.json()

      if (!evolutionResponse.ok) {
        const providerDetails = sanitizeEvolutionProviderError(evolutionData, evolutionResponse.status)
        console.error('[Disparo Externo] Evolution API error:', providerDetails)
        return NextResponse.json(
          { error: 'Erro ao enviar mensagem via Evolution API', details: providerDetails, ticket_id: ticketId, ticket_numero: ticketNumero },
          { status: evolutionResponse.status },
        )
      }

      messageId = evolutionData?.key?.id || evolutionData?.message?.key?.id || null
      canalEnvio = 'evolutionapi'
      phoneNumberIdUsed = instanceName

      // Atualizar telefone canônico
      const remoteJid: string | undefined = evolutionData?.key?.remoteJid || evolutionData?.message?.key?.remoteJid
      if (remoteJid && remoteJid.endsWith('@s.whatsapp.net')) {
        const canonicalPhone = remoteJid.replace('@s.whatsapp.net', '')
        if (canonicalPhone && canonicalPhone !== formattedPhone) {
          await supabase.from('clientes').update({ telefone: canonicalPhone }).eq('id', clienteId)
          console.log(`[Disparo Externo] Telefone canonizado pelo provedor — cliente: ${clienteId}`)
        }
      }
    } else if (canalOficial) {
      // ── API OFICIAL (Meta Cloud API) ── envio via template ──
      const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0'
      const templateId = canalOficial.template_id || setorConfig?.template_id
      const officialPhoneNumberId = canalOficial.phone_number_id || setorConfig?.phone_number_id
      const templateLanguage = canalOficial.template_language || setorConfig?.template_language || 'pt_BR'
      const accessToken = canalOficial.whatsapp_token || setorConfig?.whatsapp_token || process.env.WHATSAPP_ACCESS_TOKEN

      if (!templateId || !officialPhoneNumberId || !accessToken) {
        return NextResponse.json(
          { error: 'Canal oficial WhatsApp encontrado mas não configurado completamente (falta template_id, phone_number_id ou whatsapp_token)', ticket_id: ticketId, ticket_numero: ticketNumero },
          { status: 400 },
        )
      }

      // Enviar template — primeiro tenta com parâmetro (mensagem), depois sem
      const buildPayload = (withParams: boolean) => ({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template: {
          name: templateId,
          language: { code: templateLanguage },
          ...(withParams ? {
            components: [{ type: 'body', parameters: [{ type: 'text', text: mensagem }] }],
          } : {}),
        },
      })

      let whatsappResponse = await fetch(`${WHATSAPP_API_URL}/${officialPhoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(true)),
      })
      let whatsappData = await whatsappResponse.json()

      // Se erro de parâmetro (132000), retry sem parâmetros
      if (!whatsappResponse.ok && whatsappData?.error?.code === 132000) {
        whatsappResponse = await fetch(`${WHATSAPP_API_URL}/${officialPhoneNumberId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(false)),
        })
        whatsappData = await whatsappResponse.json()
      }

      if (!whatsappResponse.ok) {
        const providerDetails = sanitizeWhatsAppProviderError(whatsappData, whatsappResponse.status)
        console.error('[Disparo Externo] WhatsApp Official API error:', providerDetails)
        return NextResponse.json(
          { error: 'Erro ao enviar template via API Oficial WhatsApp', details: providerDetails, ticket_id: ticketId, ticket_numero: ticketNumero },
          { status: whatsappResponse.status },
        )
      }

      const providerAcceptance = getWhatsAppProviderAcceptance(whatsappData)
      if (!providerAcceptance.messageId || !providerAcceptance.hasValidatedRecipient) {
        await registrarFalhaDeDisparo(supabase, {
          setorId: setor_id,
          colaboradorId: null,
          colaboradorNome: 'Integração externa',
          clienteNome: nome,
          clienteTelefone: formattedPhone,
          clienteCnpj: cnpj,
          templateName: '[Template Oficial]',
        })
        return NextResponse.json(
          {
            error: 'Não foi possível confirmar o destinatário no WhatsApp. Nenhum ticket foi criado.',
            code: 'RECIPIENT_NOT_CONFIRMED',
          },
          { status: 502 },
        )
      }

      messageId = providerAcceptance.messageId
      canalEnvio = 'whatsapp'
      phoneNumberIdUsed = officialPhoneNumberId

      // Atualizar telefone canônico com wa_id
      const waId = whatsappData.contacts[0].wa_id
      if (waId && waId !== formattedPhone) {
        await supabase.from('clientes').update({ telefone: waId }).eq('id', clienteId)
        console.log(`[Disparo Externo] Telefone canonizado pelo provedor — cliente: ${clienteId}`)
      }
    }

    if (!ticketId) {
      console.log(`[Disparo Externo] Criando ticket após o envio — setor: ${setor_id}, subsetor: ${subsetor_id || 'none'}, canal: ${canal}`)
      let result: Awaited<ReturnType<typeof criarEDistribuirTicket>> = null
      try {
        result = await criarEDistribuirTicket(clienteId, setor_id, canal, subsetor_id || null)
      } catch (distError: any) {
        const failure = describeUnexpectedError(distError, 'Erro ao distribuir o ticket')
        console.error('[Disparo Externo] criarEDistribuirTicket threw:', failure)
        return NextResponse.json(
          { error: 'Mensagem enviada, mas não foi possível criar o ticket', details: failure },
          { status: 500 },
        )
      }

      if (!result) {
        console.error(`[Disparo Externo] criarEDistribuirTicket retornou null — setor: ${setor_id}`)
        return NextResponse.json(
          { error: 'Mensagem enviada, mas não foi possível criar o ticket' },
          { status: 500 },
        )
      }

      ticketId = result.ticketId
      colaboradorId = result.colaboradorId
      distribuido = Boolean(colaboradorId)

      const { data: ticketData } = await supabase
        .from('tickets')
        .select('numero')
        .eq('id', ticketId)
        .single()
      ticketNumero = ticketData?.numero || null
    }

    // ─── Salvar mensagem no banco ─────────────────────────────────────────────
    const conteudoMensagem = canalEnvio === 'whatsapp'
      ? `Cliente notificado via Template. Disparo externo. Aguardando resposta.`
      : mensagem

    await supabase.from('mensagens').insert({
      ticket_id: ticketId,
      remetente: 'bot',
      conteudo: conteudoMensagem,
      tipo: 'texto',
      phone_number_id: phoneNumberIdUsed,
      canal_envio: canalEnvio,
      whatsapp_message_id: messageId,
      enviado_em: new Date().toISOString(),
    })

    // ─── Salvar log de disparo (tabela opcional) ──────────────────────────────
    const { error: logError } = await supabase.from('disparo_logs').insert({
      setor_id: setor_id,
      colaborador_id: null,
      colaborador_nome: 'Integração externa',
      ticket_id: ticketId,
      cliente_nome: nome,
      cliente_telefone: formattedPhone,
      template_name: canalEnvio === 'whatsapp'
        ? `[Template Oficial]`
        : `[Externo] ${mensagem.slice(0, 60)}${mensagem.length > 60 ? '...' : ''}`,
      status: 'enviado',
    })
    if (logError) {
      console.warn('[Disparo Externo] Não foi possível registrar o disparo:', logError.code)
    }

    // ─── Resposta ─────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      ticket_id: ticketId,
      ticket_numero: ticketNumero,
      cliente_id: clienteId,
      colaborador_id: colaboradorId,
      distribuido,
      canal_utilizado: canalEnvio === 'whatsapp' ? 'api_oficial' : 'evolution_api',
      message_id: messageId,
    })
  } catch (error: any) {
    const failure = describeUnexpectedError(error, 'Erro interno no disparo externo')
    console.error('[Disparo Externo] Erro:', failure)
    return NextResponse.json(
      { error: 'Erro interno', details: failure },
      { status: 500 },
    )
  }
}
