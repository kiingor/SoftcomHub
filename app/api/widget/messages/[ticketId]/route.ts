import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'dev-secret-key',
)

interface JWTPayload {
  cliente_id: string
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await context.params
    const { searchParams } = new URL(request.url)
    const offset = parseInt(searchParams.get('offset') || '0')
    const limit = parseInt(searchParams.get('limit') || '50')

    // 1. Valida JWT
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

    const supabase = createServiceClient()

    // 2. Verifica se ticket pertence ao cliente
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('cliente_id, status, colaborador_id')
      .eq('id', ticketId)
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

    // Nome do atendente (busca separada — evita ambiguidade de embed)
    let atendenteNome: string | null = null
    if (ticket.colaborador_id) {
      const { data: colab } = await supabase
        .from('colaboradores')
        .select('nome')
        .eq('id', ticket.colaborador_id)
        .maybeSingle()
      atendenteNome = colab?.nome || null
    }

    // 3. Busca mensagens (mais recentes primeiro, depois invertemos)
    const { data: mensagens, error: msgError, count } = await supabase
      .from('mensagens')
      .select('id, remetente, conteudo, tipo, enviado_em', { count: 'exact' })
      .eq('ticket_id', ticketId)
      .order('enviado_em', { ascending: false })
      .range(offset, offset + limit - 1)

    if (msgError) {
      console.error('Error fetching messages:', msgError)
      return NextResponse.json(
        { error: 'Erro ao buscar mensagens' },
        { status: 500 },
      )
    }

    // 4. Inverte para ordem cronológica (mais antigas primeiro)
    const mensagensOrdenadas = (mensagens || []).reverse()

    return NextResponse.json(
      {
        mensagens: mensagensOrdenadas,
        ticket: {
          status: ticket.status,
          em_atendimento: !!ticket.colaborador_id,
          atendente_nome: atendenteNome,
        },
        total: count,
        offset,
        limit,
        has_more: offset + limit < (count || 0),
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('Widget messages fetch error:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar mensagens' },
      { status: 500 },
    )
  }
}
