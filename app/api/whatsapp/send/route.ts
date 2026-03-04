import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

const body = await request.json()
    const { ticketId, message, recipientPhone, phoneNumberId, imageUrl, fileUrl, fileType, messageId } = body

    // Support both imageUrl (legacy) and fileUrl (new)
    const mediaUrl = fileUrl || imageUrl
    const mediaType = fileType || (imageUrl ? 'image/jpeg' : null)

    if (!ticketId || (!message && !mediaUrl) || !recipientPhone) {
      return NextResponse.json(
        { error: 'Missing required fields: ticketId, message or mediaUrl, recipientPhone' },
        { status: 400 }
      )
    }

    console.log('[WhatsApp Send] Starting send:', { ticketId, hasMessage: !!message, hasMedia: !!mediaUrl, mediaType, recipientPhone })

    // Try to get credentials - Priority: setor_canais > setores > env vars
    let accessToken = process.env.WHATSAPP_ACCESS_TOKEN
    let senderPhoneNumberId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID

    if (ticketId) {
      const { data: ticket } = await supabase
        .from('tickets')
        .select('setor_id')
        .eq('id', ticketId)
        .single()

      if (ticket?.setor_id) {
        // Priority 1: Check setor_canais by phone_number_id
        if (phoneNumberId) {
          const { data: canalMatch } = await supabase
            .from('setor_canais')
            .select('phone_number_id, whatsapp_token')
            .eq('setor_id', ticket.setor_id)
            .eq('phone_number_id', phoneNumberId)
            .eq('tipo', 'whatsapp')
            .eq('ativo', true)
            .limit(1)
            .maybeSingle()

          if (canalMatch) {
            if (canalMatch.whatsapp_token) accessToken = canalMatch.whatsapp_token
            senderPhoneNumberId = canalMatch.phone_number_id || senderPhoneNumberId
            console.log('[WhatsApp Send] Using setor_canais credentials for phone_number_id:', phoneNumberId)
          }
        }

        // Priority 2: Fallback to setores table
        if (!accessToken || accessToken === process.env.WHATSAPP_ACCESS_TOKEN) {
          const { data: setor } = await supabase
            .from('setores')
            .select('phone_number_id, whatsapp_token')
            .eq('id', ticket.setor_id)
            .single()

          if (setor?.whatsapp_token) {
            accessToken = setor.whatsapp_token
          }
          if (!senderPhoneNumberId && setor?.phone_number_id) {
            senderPhoneNumberId = setor.phone_number_id
          }
        }
      }
    }

    if (!accessToken || !senderPhoneNumberId) {
      return NextResponse.json(
        { error: 'WhatsApp credentials not configured' },
        { status: 500 }
      )
    }

    // Format phone number (remove non-digits and ensure country code)
    const formattedPhone = recipientPhone.replace(/\D/g, '')

    // Build message payload based on type (image, document, or text)
    let messagePayload: Record<string, unknown>

    if (mediaUrl) {
      const isImage = mediaType?.startsWith('image/')
      const isPdf = mediaType === 'application/pdf'

      if (isImage) {
        // Send image message
        messagePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'image',
          image: {
            link: mediaUrl,
            caption: message || undefined,
          },
        }
      } else if (isPdf) {
        // Send document message (PDF)
        messagePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'document',
          document: {
            link: mediaUrl,
            caption: message || undefined,
            filename: message || 'documento.pdf',
          },
        }
      } else {
        // Unknown media type - try as document
        messagePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'document',
          document: {
            link: mediaUrl,
            caption: message || undefined,
          },
        }
      }
    } else {
      // Send text message
      messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      }
    }

    const whatsappUrl = `${WHATSAPP_API_URL}/${senderPhoneNumberId}/messages`

    // Log curl equivalent for debugging
    console.log(`[WhatsApp Send] curl --location '${whatsappUrl}' \\
  --header 'Authorization: Bearer ${accessToken?.substring(0, 10)}...' \\
  --header 'Content-Type: application/json' \\
  --data '${JSON.stringify(messagePayload, null, 4)}'`)

    // Send message via WhatsApp Cloud API
    const whatsappResponse = await fetch(whatsappUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    })

    const whatsappData = await whatsappResponse.json()

    console.log('[WhatsApp Send] API Response - Status:', whatsappResponse.status, '| Body:', JSON.stringify(whatsappData, null, 2))

    if (!whatsappResponse.ok) {
      console.error('[WhatsApp Send] API error:', whatsappData)
      return NextResponse.json(
        { error: 'Failed to send WhatsApp message', details: whatsappData },
        { status: whatsappResponse.status }
      )
    }

    console.log('[WhatsApp Send] Message sent successfully, WhatsApp ID:', whatsappData.messages?.[0]?.id)

    // Get colaborador info
    const { data: colaborador } = await supabase
      .from('colaboradores')
      .select('id')
      .eq('email', user.email)
      .single()

    let savedMessage = null

    // If messageId was provided, update the existing message with WhatsApp ID
    if (messageId) {
      console.log('[WhatsApp Send] Updating existing message:', messageId)
      const { data, error: updateError } = await supabase
        .from('mensagens')
        .update({
          whatsapp_message_id: whatsappData.messages?.[0]?.id,
        })
        .eq('id', messageId)
        .select()
        .single()

      if (updateError) {
        console.error('[WhatsApp Send] Database update error:', updateError)
      } else {
        console.log('[WhatsApp Send] Message updated successfully')
      }
      savedMessage = data
    } else {
      // Save new message to database (fallback for old behavior)
      console.log('[WhatsApp Send] Creating new message in database')
      const messageType = mediaType?.startsWith('image/') ? 'imagem' : mediaType === 'application/pdf' ? 'documento' : 'texto'
      const { data, error: dbError } = await supabase
        .from('mensagens')
        .insert({
          ticket_id: ticketId,
          remetente: 'colaborador',
          conteudo: message || '',
          tipo: messageType,
          phone_number_id: senderPhoneNumberId,
          whatsapp_message_id: whatsappData.messages?.[0]?.id,
          url_imagem: mediaUrl || null,
          media_type: mediaType || null,
        })
        .select()
        .single()

      if (dbError) {
        console.error('[WhatsApp Send] Database error:', dbError)
        // Message was sent but not saved - still return success but warn
        return NextResponse.json({
          success: true,
          warning: 'Message sent but failed to save to database',
          whatsappMessageId: whatsappData.messages?.[0]?.id,
        })
      }
      console.log('[WhatsApp Send] Message saved successfully')
      savedMessage = data
    }

    // Update ticket first response time if this is the first colaborador message
    const { data: existingMessages } = await supabase
      .from('mensagens')
      .select('id')
      .eq('ticket_id', ticketId)
      .eq('remetente', 'colaborador')
      .limit(2)

    if (existingMessages && existingMessages.length === 1) {
      // This was the first colaborador message
      await supabase
        .from('tickets')
        .update({ primeira_resposta_em: new Date().toISOString() })
        .eq('id', ticketId)
    }

    return NextResponse.json({
      success: true,
      message: savedMessage,
      whatsappMessageId: whatsappData.messages?.[0]?.id,
    })
  } catch (error) {
    console.error('Error sending WhatsApp message:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
