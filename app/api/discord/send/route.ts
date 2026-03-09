import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DISCORD_API_URL = 'https://discord.com/api/v10'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { ticketId, message, messageId, fileUrl, fileType, fileName } = body

    console.log('[Discord Send] ========== INÍCIO ==========')
    console.log('[Discord Send] ticketId:', ticketId, '| message:', message?.slice(0, 50))

    if (!ticketId || (!message && !fileUrl)) {
      return NextResponse.json(
        { error: 'Missing required fields: ticketId, message or fileUrl' },
        { status: 400 },
      )
    }

    // Get ticket to find setor
    const { data: ticket } = await supabase
      .from('tickets')
      .select('setor_id, cliente_id')
      .eq('id', ticketId)
      .single()

    console.log('[Discord Send] ticket.setor_id:', ticket?.setor_id, '| ticket.cliente_id:', ticket?.cliente_id)

    if (!ticket?.setor_id) {
      return NextResponse.json({ error: 'Ticket ou setor nao encontrado' }, { status: 404 })
    }

    // Get Discord credentials - Priority: setor_canais > setores
    let discordBotToken: string | null = null
    let guildId: string | null = null

    // Priority 1: Check setor_canais for discord channel (mais recente primeiro)
    const { data: todosCanaisDiscord } = await supabase
      .from('setor_canais')
      .select('id, discord_bot_token, discord_guild_id, ativo, nome, criado_em')
      .eq('setor_id', ticket.setor_id)
      .eq('tipo', 'discord')

    console.log('[Discord Send] Todos os canais Discord do setor:', JSON.stringify(todosCanaisDiscord))

    const canalMatch = todosCanaisDiscord
      ?.filter(c => c.ativo && c.discord_bot_token)
      .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())[0] || null

    if (canalMatch?.discord_bot_token) {
      discordBotToken = canalMatch.discord_bot_token
      guildId = canalMatch.discord_guild_id
      console.log('[Discord Send] Usando setor_canais — canal_id:', canalMatch.id, '| nome:', canalMatch.nome, '| token prefix:', discordBotToken.slice(0, 15) + '...')
    }

    // Priority 2: Fallback to setores table
    if (!discordBotToken) {
      const { data: setor } = await supabase
        .from('setores')
        .select('discord_bot_token, discord_guild_id')
        .eq('id', ticket.setor_id)
        .single()

      discordBotToken = setor?.discord_bot_token || null
      guildId = guildId || setor?.discord_guild_id || null
      console.log('[Discord Send] Fallback setores legado — token prefix:', discordBotToken?.slice(0, 15) + '...')
    }

    if (!discordBotToken) {
      console.error('[Discord Send] ERRO: Nenhum bot token encontrado para setor', ticket.setor_id)
      return NextResponse.json(
        { error: 'Discord bot token nao configurado para este setor' },
        { status: 400 },
      )
    }

    // Get the discord_user_id from the client or from the last client message
    let discordUserId: string | null = null

    // First try from clientes table
    if (ticket.cliente_id) {
      const { data: cliente } = await supabase
        .from('clientes')
        .select('discord_user_id')
        .eq('id', ticket.cliente_id)
        .single()
      discordUserId = cliente?.discord_user_id || null
      console.log('[Discord Send] discord_user_id da tabela clientes:', discordUserId)
    }

    // Fallback: get from the last client message with discord_user_id
    if (!discordUserId) {
      const { data: lastMsg } = await supabase
        .from('mensagens')
        .select('discord_user_id')
        .eq('ticket_id', ticketId)
        .not('discord_user_id', 'is', null)
        .order('enviado_em', { ascending: false })
        .limit(1)
      discordUserId = lastMsg?.[0]?.discord_user_id || null
      console.log('[Discord Send] discord_user_id da última mensagem:', discordUserId)
    }

    if (!discordUserId) {
      console.error('[Discord Send] ERRO: discord_user_id não encontrado para ticketId', ticketId)
      return NextResponse.json(
        { error: 'Discord User ID nao encontrado para este cliente. O cliente precisa enviar uma mensagem primeiro.' },
        { status: 400 },
      )
    }

    // Step 1: Open a DM channel with the user
    const dmUrl = `${DISCORD_API_URL}/users/@me/channels`
    const dmBody = JSON.stringify({ recipient_id: discordUserId })
    console.log(`[Discord Send] CURL Step 1 — Abrir DM:`)
    console.log(`curl -X POST '${dmUrl}' -H 'Authorization: Bot ${discordBotToken}' -H 'Content-Type: application/json' -d '${dmBody}'`)

    const dmChannelResponse = await fetch(dmUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${discordBotToken}`,
        'Content-Type': 'application/json',
      },
      body: dmBody,
    })

    const dmChannel = await dmChannelResponse.json()
    console.log('[Discord Send] Resposta DM channel (status', dmChannelResponse.status, '):', JSON.stringify(dmChannel))

    if (!dmChannelResponse.ok) {
      console.error('[Discord Send] ERRO ao abrir DM channel:', dmChannel)
      return NextResponse.json(
        { error: 'Erro ao abrir DM com o usuario no Discord', details: dmChannel },
        { status: dmChannelResponse.status },
      )
    }

    // Step 2: Send message in the DM channel (with optional file attachment)
    let discordResponse: Response
    let discordData: any

    const sendMsgUrl = `${DISCORD_API_URL}/channels/${dmChannel.id}/messages`

    if (fileUrl) {
      // Download the file from the URL first
      const fileResponse = await fetch(fileUrl)
      if (!fileResponse.ok) {
        return NextResponse.json(
          { error: 'Erro ao baixar arquivo para envio' },
          { status: 500 },
        )
      }
      const fileBuffer = await fileResponse.arrayBuffer()
      const resolvedFileName = fileName || fileUrl.split('/').pop() || 'arquivo'

      // Build multipart/form-data with the file
      const formData = new FormData()
      if (message) {
        formData.append('payload_json', JSON.stringify({ content: message }))
      }
      formData.append(
        'files[0]',
        new Blob([fileBuffer], { type: fileType || 'application/octet-stream' }),
        resolvedFileName,
      )

      console.log(`[Discord Send] CURL Step 2 — Enviar arquivo para canal ${dmChannel.id}:`)
      console.log(`curl -X POST '${sendMsgUrl}' -H 'Authorization: Bot ${discordBotToken}' -F 'files[0]=@${resolvedFileName}'`)

      discordResponse = await fetch(sendMsgUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${discordBotToken}`,
        },
        body: formData,
      })
    } else {
      const sendBody = JSON.stringify({ content: message })
      console.log(`[Discord Send] CURL Step 2 — Enviar mensagem para canal ${dmChannel.id}:`)
      console.log(`curl -X POST '${sendMsgUrl}' -H 'Authorization: Bot ${discordBotToken}' -H 'Content-Type: application/json' -d '${sendBody}'`)

      discordResponse = await fetch(sendMsgUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${discordBotToken}`,
          'Content-Type': 'application/json',
        },
        body: sendBody,
      })
    }

    discordData = await discordResponse.json()
    console.log('[Discord Send] Resposta envio mensagem (status', discordResponse.status, '):', JSON.stringify(discordData))

    if (!discordResponse.ok) {
      console.error('[Discord Send] ERRO ao enviar mensagem:', discordData)
      return NextResponse.json(
        { error: 'Erro ao enviar mensagem no Discord', details: discordData },
        { status: discordResponse.status },
      )
    }

    console.log('[Discord Send] ✅ Mensagem enviada com sucesso! discord_message_id:', discordData.id)

    // Update the saved message with the discord message id if messageId was provided
    if (messageId) {
      await supabase
        .from('mensagens')
        .update({ whatsapp_message_id: discordData.id })
        .eq('id', messageId)
    }

    // Set primeira_resposta_em on ticket if not yet set (same as WhatsApp/Evolution routes)
    if (ticketId) {
      const { data: ticketData } = await supabase
        .from('tickets')
        .select('primeira_resposta_em')
        .eq('id', ticketId)
        .single()

      if (ticketData && !ticketData.primeira_resposta_em) {
        await supabase
          .from('tickets')
          .update({ primeira_resposta_em: new Date().toISOString() })
          .eq('id', ticketId)
      }
    }

    return NextResponse.json({
      success: true,
      messageId: discordData.id,
      dmChannelId: dmChannel.id,
      guildId: guildId || null,
    })
  } catch (error) {
    console.error('[Discord Send] ERRO interno:', error)
    return NextResponse.json(
      { error: 'Erro interno ao enviar mensagem' },
      { status: 500 },
    )
  }
}
