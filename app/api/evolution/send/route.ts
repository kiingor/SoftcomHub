import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { ticketId, message, messageId, instanceName, fileUrl, fileType, fileName } = body
    if (!ticketId || (!message && !fileUrl)) {
      return NextResponse.json(
        { error: 'Missing required fields: ticketId, message or fileUrl' },
        { status: 400 },
      )
    }

    // Get ticket to find setor and client phone
    const { data: ticket } = await supabase
      .from('tickets')
      .select('setor_id, cliente_id, clientes(telefone)')
      .eq('id', ticketId)
      .single()

    if (!ticket?.setor_id) {
      return NextResponse.json({ error: 'Ticket ou setor nao encontrado' }, { status: 404 })
    }

    const clientePhone = (ticket as any).clientes?.telefone
    if (!clientePhone) {
      return NextResponse.json({ error: 'Telefone do cliente nao encontrado' }, { status: 400 })
    }

    // Get EvolutionAPI credentials - Priority: setor_canais > setores
    let evolutionBaseUrl: string | null = null
    let evolutionApiKey: string | null = null

    // Priority 1: Check setor_canais by evolution_api_key (matched via instanceName/phone_number_id)
    if (instanceName) {
      const { data: canalMatch } = await supabase
        .from('setor_canais')
        .select('evolution_base_url, evolution_api_key')
        .eq('setor_id', ticket.setor_id)
        .eq('tipo', 'evolution_api')
        .eq('ativo', true)
        .limit(5)

      // Try matching by evolution_api_key (stored in phone_number_id of messages)
      if (canalMatch && canalMatch.length > 0) {
        // Use the first active evolution_api canal
        const canal = canalMatch[0]
        evolutionBaseUrl = canal.evolution_base_url
        evolutionApiKey = canal.evolution_api_key
        console.log('[EvolutionAPI Send] Using setor_canais credentials')
      }
    }

    // Priority 2: Fallback to setores table
    if (!evolutionBaseUrl || !evolutionApiKey) {
      const { data: setor } = await supabase
        .from('setores')
        .select('evolution_base_url, evolution_api_key')
        .eq('id', ticket.setor_id)
        .single()

      evolutionBaseUrl = evolutionBaseUrl || setor?.evolution_base_url
      evolutionApiKey = evolutionApiKey || setor?.evolution_api_key
    }

    if (!evolutionBaseUrl || !evolutionApiKey) {
      return NextResponse.json(
        { error: 'EvolutionAPI nao configurada neste setor' },
        { status: 500 },
      )
    }

    // Resolve instanceName: use provided or fetch from last client message
    let resolvedInstance = instanceName
    if (!resolvedInstance) {
      const { data: lastMsg } = await supabase
        .from('mensagens')
        .select('phone_number_id')
        .eq('ticket_id', ticketId)
        .eq('remetente', 'cliente')
        .not('phone_number_id', 'is', null)
        .order('enviado_em', { ascending: false })
        .limit(1)
        .single()

      resolvedInstance = lastMsg?.phone_number_id
    }

    if (!resolvedInstance) {
      return NextResponse.json(
        { error: 'Nao foi possivel determinar a instancia (instanceName). Nenhuma mensagem do cliente com phone_number_id encontrada.' },
        { status: 400 },
      )
    }

    // Format phone number (remove non-digits)
    const formattedPhone = clientePhone.replace(/\D/g, '')

    // Remove trailing slash from base URL
    const baseUrl = evolutionBaseUrl.replace(/\/+$/, '')

    // Determine if this is a media or text message
    const isMedia = !!fileUrl
    let evolutionUrl: string
    let evolutionBody: Record<string, any>

    if (isMedia) {
      // Resolve mediatype from fileType/fileName
      let mediatype = 'document'
      let mimetype = fileType || 'application/octet-stream'

      if (fileType?.startsWith('image/')) {
        mediatype = 'image'
      } else if (fileType?.startsWith('video/')) {
        mediatype = 'video'
      } else if (fileType?.startsWith('audio/')) {
        mediatype = 'audio'
      } else if (fileType === 'application/pdf' || fileName?.toLowerCase().endsWith('.pdf')) {
        mediatype = 'document'
        mimetype = 'application/pdf'
      }

      evolutionUrl = `${baseUrl}/message/sendMedia/${resolvedInstance}`
      evolutionBody = {
        number: formattedPhone,
        mediatype,
        mimetype,
        media: fileUrl,
        fileName: fileName || 'arquivo',
        caption: message || '',
        delay: 1000,
      }
    } else {
      evolutionUrl = `${baseUrl}/message/sendText/${resolvedInstance}`
      evolutionBody = {
        number: formattedPhone,
        text: message,
        delay: 1000,
      }
    }

    // Log curl equivalent for debugging
    console.log(`[EvolutionAPI] curl --location '${evolutionUrl}' \\
  --header 'apikey: ${evolutionApiKey}' \\
  --header 'Content-Type: application/json' \\
  --data '${JSON.stringify(evolutionBody, null, 4)}'`)

    // Send message via EvolutionAPI
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
      console.error('[EvolutionAPI Send] API error:', evolutionData)
      return NextResponse.json(
        { error: 'Erro ao enviar mensagem via EvolutionAPI', details: evolutionData },
        { status: evolutionResponse.status },
      )
    }

    // If messageId provided, update existing message with instance info
    if (messageId) {
      await supabase
        .from('mensagens')
        .update({
          phone_number_id: resolvedInstance,
        })
        .eq('id', messageId)
    }

    // Update ticket first response time if this is the first colaborador message
    const { data: existingMessages } = await supabase
      .from('mensagens')
      .select('id')
      .eq('ticket_id', ticketId)
      .eq('remetente', 'colaborador')
      .limit(2)

    if (existingMessages && existingMessages.length === 1) {
      await supabase
        .from('tickets')
        .update({ primeira_resposta_em: new Date().toISOString() })
        .eq('id', ticketId)
    }

    return NextResponse.json({
      success: true,
      evolutionData,
    })
  } catch (error) {
    console.error('[EvolutionAPI Send] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
