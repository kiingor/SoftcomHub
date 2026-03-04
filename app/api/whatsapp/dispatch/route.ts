import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { clienteNome, clienteCnpj, clienteRegistro, telefone, setorId } = body

    if (!clienteNome || !telefone || !setorId) {
      return NextResponse.json(
        { error: 'Campos obrigatorios: clienteNome, telefone, setorId' },
        { status: 400 }
      )
    }

    // Get setor config (basic info)
    const { data: setor, error: setorError } = await supabase
      .from('setores')
      .select('id, nome, template_id, phone_number_id, template_language, whatsapp_token, max_disparos_dia')
      .eq('id', setorId)
      .single()

    if (setorError || !setor) {
      return NextResponse.json({ error: 'Setor nao encontrado' }, { status: 404 })
    }

    // Priority 1: Get dispatch credentials from setor_canais (whatsapp type, active)
    let dispatchTemplateId = setor.template_id
    let dispatchPhoneNumberId = setor.phone_number_id
    let dispatchTemplateLanguage = setor.template_language || 'pt_BR'
    let dispatchWhatsappToken = setor.whatsapp_token
    let dispatchMaxDisparosDia = setor.max_disparos_dia

    const { data: canalWhatsapp } = await supabase
      .from('setor_canais')
      .select('phone_number_id, whatsapp_token, template_id, template_language, max_disparos_dia')
      .eq('setor_id', setorId)
      .eq('tipo', 'whatsapp')
      .eq('ativo', true)
      .order('criado_em', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (canalWhatsapp) {
      // Override with setor_canais credentials if available
      if (canalWhatsapp.template_id) dispatchTemplateId = canalWhatsapp.template_id
      if (canalWhatsapp.phone_number_id) dispatchPhoneNumberId = canalWhatsapp.phone_number_id
      if (canalWhatsapp.template_language) dispatchTemplateLanguage = canalWhatsapp.template_language
      if (canalWhatsapp.whatsapp_token) dispatchWhatsappToken = canalWhatsapp.whatsapp_token
      if (canalWhatsapp.max_disparos_dia) dispatchMaxDisparosDia = canalWhatsapp.max_disparos_dia
      console.log('[Dispatch] Using setor_canais credentials for dispatch')
    }

    if (!dispatchTemplateId || !dispatchPhoneNumberId) {
      return NextResponse.json(
        { error: 'Setor nao configurado para disparo. Configure o Template ID e Phone Number ID nas configuracoes do setor ou nos canais.' },
        { status: 400 }
      )
    }

    // Check daily dispatch limit
    if (dispatchMaxDisparosDia && dispatchMaxDisparosDia > 0) {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { count } = await supabase
        .from('disparo_logs')
        .select('*', { count: 'exact', head: true })
        .eq('setor_id', setorId)
        .gte('created_at', todayStart.toISOString())

      if ((count || 0) >= dispatchMaxDisparosDia) {
        return NextResponse.json(
          { error: `Limite diario de disparos atingido (${dispatchMaxDisparosDia}/${dispatchMaxDisparosDia}). Tente novamente amanha.` },
          { status: 429 }
        )
      }
    }

    // Use setor-specific token, fallback to global env token
    const accessToken = dispatchWhatsappToken || process.env.WHATSAPP_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({ error: 'Token do WhatsApp nao configurado. Defina o token nas configuracoes do setor/canal ou na variavel de ambiente.' }, { status: 500 })
    }

    // Get colaborador info
    const { data: colaborador } = await supabase
      .from('colaboradores')
      .select('id, nome, setor_id')
      .eq('email', user.email)
      .single()

    if (!colaborador) {
      return NextResponse.json({ error: 'Colaborador nao encontrado' }, { status: 404 })
    }

    // Format phone number
    const formattedPhone = telefone.replace(/\D/g, '')

    // Use the language from resolved dispatch config
    const templateLanguage = dispatchTemplateLanguage

    // Build payload - first try with atendente_name parameter
    const buildPayload = (withParams: boolean) => ({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'template',
      template: {
        name: dispatchTemplateId,
        language: {
          code: templateLanguage,
        },
        ...(withParams
          ? {
              components: [
                {
                  type: 'body',
                  parameters: [
                    {
                      type: 'text',
                      text: colaborador.nome,
                    },
                  ],
                },
              ],
            }
          : {}),
      },
    })

    // Try with parameters first, fallback to without if template has no variables
    let whatsappResponse = await fetch(
      `${WHATSAPP_API_URL}/${dispatchPhoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPayload(true)),
      }
    )

    let whatsappData = await whatsappResponse.json()

    // If parameter mismatch (132000), retry without parameters
    if (!whatsappResponse.ok && whatsappData?.error?.code === 132000) {
      // Template has no params, retry without parameters
      whatsappResponse = await fetch(
        `${WHATSAPP_API_URL}/${dispatchPhoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildPayload(false)),
        }
      )
      whatsappData = await whatsappResponse.json()
    }

    if (!whatsappResponse.ok) {
      console.error('[Dispatch] WhatsApp API error:', whatsappData)
      return NextResponse.json(
        { error: 'Erro ao enviar template', details: whatsappData },
        { status: whatsappResponse.status }
      )
    }

    // Get wa_id from response (the phone registered in WhatsApp)
    const waId = whatsappData.contacts?.[0]?.wa_id || formattedPhone
    const whatsappMessageId = whatsappData.messages?.[0]?.id

    // Find or create cliente
    const cleanCnpj = clienteCnpj?.replace(/\D/g, '') || null

    let clienteId: string

    // Check if cliente exists by phone
    const { data: existingCliente } = await supabase
      .from('clientes')
      .select('id')
      .eq('telefone', waId)
      .maybeSingle()

    if (existingCliente) {
      clienteId = existingCliente.id
      // Update CNPJ and Registro if missing
      await supabase
        .from('clientes')
        .update({
          CNPJ: cleanCnpj || undefined,
          Registro: clienteRegistro || undefined,
          nome: clienteNome,
        })
        .eq('id', clienteId)
    } else {
      // Create new cliente with wa_id as phone
      const { data: newCliente, error: clienteError } = await supabase
        .from('clientes')
        .insert({
          nome: clienteNome,
          telefone: waId,
          CNPJ: cleanCnpj,
          Registro: clienteRegistro || null,
        })
        .select('id')
        .single()

      if (clienteError || !newCliente) {
        console.error('[Dispatch] Error creating cliente:', clienteError)
        return NextResponse.json({ error: 'Erro ao criar cliente' }, { status: 500 })
      }
      clienteId = newCliente.id
    }

    // Check for existing open ticket for this client
    const { data: existingTicket } = await supabase
      .from('tickets')
      .select('id')
      .eq('cliente_id', clienteId)
      .in('status', ['aberto', 'em_atendimento'])
      .maybeSingle()

    if (existingTicket) {
      return NextResponse.json({
        success: true,
        warning: 'Ja existe um ticket aberto para este cliente',
        ticketId: existingTicket.id,
        whatsappMessageId,
        waId,
      })
    }

    // Create ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        cliente_id: clienteId,
        colaborador_id: colaborador.id,
        setor_id: setorId,
        status: 'em_atendimento',
        prioridade: 'normal',
        canal: 'whatsapp',
        is_disparo: true,
        disparo_em: new Date().toISOString(),
      })
      .select('id, numero')
      .single()

    if (ticketError || !ticket) {
      console.error('[Dispatch] Error creating ticket:', ticketError)
      return NextResponse.json({ error: 'Erro ao criar ticket' }, { status: 500 })
    }

    // Save the dispatch notification as a system message
    await supabase.from('mensagens').insert({
      ticket_id: ticket.id,
      remetente: 'sistema',
      conteudo: `Cliente notificado via Template (${dispatchTemplateId}). Disparo realizado por ${colaborador.nome}. Aguardando resposta do cliente.`,
      tipo: 'texto',
      whatsapp_message_id: whatsappMessageId,
      phone_number_id: dispatchPhoneNumberId,
      canal_envio: 'whatsapp',
      enviado_em: new Date().toISOString(),
    })

    // Save dispatch log
    await supabase.from('disparo_logs').insert({
      setor_id: setorId,
      colaborador_id: colaborador.id,
      ticket_id: ticket.id,
      cliente_nome: clienteNome,
      cliente_telefone: waId,
      template_usado: dispatchTemplateId,
      status: 'enviado',
    })

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      ticketNumero: ticket.numero,
      whatsappMessageId,
      waId,
      clienteId,
    })
  } catch (error) {
    console.error('[Dispatch] Error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
