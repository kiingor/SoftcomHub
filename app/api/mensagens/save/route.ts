import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/mensagens/save
 * 
 * Endpoint para salvar mensagens de conversas externas (bot/n8n) no banco.
 * Permite salvar mensagens sem ticket (conversa com bot antes da criação do ticket)
 * e mensagens com ticket (respostas do bot durante o atendimento).
 * 
 * Body:
 *   - telefone (string, obrigatório): telefone do cliente (ex: "553389127816")
 *   - conteudo (string, obrigatório): conteúdo da mensagem
 *   - remetente (string): "cliente" | "bot" | "sistema" (default: "bot")
 *   - tipo (string): "texto" | "imagem" | "audio" | "video" | "documento" (default: "texto")
 *   - ticket_id (string, opcional): ID do ticket (se já existir)
 *   - cliente_id (string, opcional): ID do cliente (se já souber)
 *   - nome_cliente (string, opcional): nome do cliente (para criação automática)
 *   - canal_envio (string, opcional): "whatsapp" | "evolutionapi" | "discord"
 *   - instancia (string, opcional): nome da instância Evolution
 *   - phone_number_id (string, opcional): phone_number_id do WhatsApp
 *   - url_imagem (string, opcional): URL da imagem/mídia
 *   - media_type (string, opcional): tipo MIME da mídia
 *   - whatsapp_message_id (string, opcional): ID da mensagem no WhatsApp/Evolution
 * 
 * Retorna:
 *   - { success: true, mensagem_id, cliente_id }
 * 
 * Uso pelo n8n:
 *   curl -X POST https://seu-dominio/api/mensagens/save \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "telefone": "553389127816",
 *       "conteudo": "Olá, como posso ajudar?",
 *       "remetente": "bot",
 *       "tipo": "texto"
 *     }'
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      telefone,
      conteudo,
      remetente = 'bot',
      tipo = 'texto',
      ticket_id = null,
      cliente_id = null,
      nome_cliente,
      canal_envio,
      instancia,
      phone_number_id,
      url_imagem,
      media_type,
      whatsapp_message_id,
    } = body

    // Validar campos obrigatórios
    if (!conteudo && !url_imagem) {
      return NextResponse.json(
        { error: 'conteudo ou url_imagem é obrigatório' },
        { status: 400 }
      )
    }

    if (!telefone && !cliente_id) {
      return NextResponse.json(
        { error: 'telefone ou cliente_id é obrigatório' },
        { status: 400 }
      )
    }

    // Resolver cliente_id
    let resolvedClienteId = cliente_id

    if (!resolvedClienteId && telefone) {
      // Buscar cliente existente pelo telefone
      const { data: existingCliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('telefone', telefone)
        .maybeSingle()

      if (existingCliente) {
        resolvedClienteId = existingCliente.id
      } else {
        // Criar novo cliente
        const { data: newCliente, error: clienteError } = await supabase
          .from('clientes')
          .insert({
            telefone,
            nome: nome_cliente || 'Desconhecido',
          })
          .select('id')
          .single()

        if (clienteError || !newCliente) {
          console.error('[Mensagens Save] Erro ao criar cliente:', clienteError)
          return NextResponse.json(
            { error: 'Erro ao criar cliente' },
            { status: 500 }
          )
        }

        resolvedClienteId = newCliente.id
      }
    }

    // Montar objeto da mensagem
    const mensagemData: Record<string, unknown> = {
      cliente_id: resolvedClienteId,
      ticket_id: ticket_id || null,
      remetente,
      conteudo: conteudo || '',
      tipo,
      enviado_em: new Date().toISOString(),
    }

    // Campos opcionais
    if (canal_envio) mensagemData.canal_envio = canal_envio
    if (instancia) mensagemData.instancia = instancia
    if (phone_number_id) mensagemData.phone_number_id = phone_number_id
    if (url_imagem) mensagemData.url_imagem = url_imagem

    // Autodetecta vCard (Evolution/WhatsApp enviam contato como JSON com BEGIN:VCARD)
    // para que o workdesk renderize o ContactCard mesmo quando o integrador não setou media_type.
    const effectiveMediaType =
      media_type || (typeof conteudo === 'string' && conteudo.includes('BEGIN:VCARD') ? 'contact' : null)
    if (effectiveMediaType) mensagemData.media_type = effectiveMediaType

    if (whatsapp_message_id) mensagemData.whatsapp_message_id = whatsapp_message_id

    // Salvar mensagem
    const { data: mensagem, error: msgError } = await supabase
      .from('mensagens')
      .insert(mensagemData)
      .select('id')
      .single()

    if (msgError) {
      console.error('[Mensagens Save] Erro ao salvar mensagem:', msgError)
      return NextResponse.json(
        { error: 'Erro ao salvar mensagem', details: msgError.message },
        { status: 500 }
      )
    }

    console.log(
      `[Mensagens Save] Mensagem salva: id=${mensagem.id}, cliente=${resolvedClienteId}, ticket=${ticket_id || 'sem ticket'}, remetente=${remetente}`
    )

    return NextResponse.json({
      success: true,
      mensagem_id: mensagem.id,
      cliente_id: resolvedClienteId,
    })
  } catch (error) {
    console.error('[Mensagens Save] Erro:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
