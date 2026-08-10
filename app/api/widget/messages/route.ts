import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { notifyAtendenteNovaMensagem } from '@/lib/notify-mensagem'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'dev-secret-key',
)

interface JWTPayload {
  cliente_id: string
  setor_id: string
  tipo: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ticket_id, conteudo, tipo = 'texto' } = body

    // 1. Valida JWT do header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Token não fornecido' },
        { status: 401 },
      )
    }

    const token = authHeader.slice(7)
    let decoded: JWTPayload

    try {
      const verified = await jwtVerify(token, JWT_SECRET)
      decoded = verified.payload as unknown as JWTPayload
    } catch {
      return NextResponse.json(
        { error: 'Token inválido' },
        { status: 401 },
      )
    }

    // 2. Validações
    if (!ticket_id || !conteudo) {
      return NextResponse.json(
        { error: 'ticket_id e conteudo são obrigatórios' },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()

    // 3. Verifica se ticket pertence ao cliente
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, cliente_id, status, colaborador_id')
      .eq('id', ticket_id)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json(
        { error: 'Ticket não encontrado' },
        { status: 404 },
      )
    }

    if (ticket.cliente_id !== decoded.cliente_id) {
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 },
      )
    }

    if (ticket.status === 'encerrado') {
      return NextResponse.json(
        { error: 'Ticket encerrado' },
        { status: 400 },
      )
    }

    // 4. Salva mensagem
    const { data: mensagem, error: msgError } = await supabase
      .from('mensagens')
      .insert({
        ticket_id,
        remetente: 'cliente-widget',
        conteudo,
        tipo,
      })
      .select('id')
      .single()

    if (msgError) {
      console.error('Error saving message:', msgError)
      return NextResponse.json(
        { error: 'Erro ao salvar mensagem' },
        { status: 500 },
      )
    }

    // 5. Notifica apenas o responsável pelo ticket.
    if (ticket.colaborador_id) {
      try {
        await notifyAtendenteNovaMensagem({
          ticketId: ticket_id,
          conteudo,
          tipo,
        })
      } catch (notifyError) {
        console.error('Error notifying attendant:', notifyError)
        // Não falha a request por causa disso
      }
    }

    return NextResponse.json(
      {
        success: true,
        mensagem_id: mensagem.id,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('Widget message error:', error)
    return NextResponse.json(
      { error: 'Erro ao enviar mensagem' },
      { status: 500 },
    )
  }
}
