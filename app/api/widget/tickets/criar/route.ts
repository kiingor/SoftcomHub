import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
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
    // 1. Exige e valida o JWT gerado em /api/widget/auth.
    //    O cliente_id e o setor_id vêm DO TOKEN — nunca reresolvemos por
    //    telefone aqui. Isso garante que o ticket e o JWT apontem para o
    //    mesmo cliente, e impede criar ticket para qualquer telefone sem auth.
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
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const cliente_id = decoded.cliente_id
    const setor_id = decoded.setor_id

    const body = await request.json()
    const { widget_key } = body

    if (!widget_key || !setor_id || !cliente_id) {
      return NextResponse.json(
        { error: 'Dados insuficientes para criar o ticket' },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()

    // 2. Valida widget
    const { data: widget } = await supabase
      .from('widget_configs')
      .select('id, canal')
      .eq('api_key', widget_key)
      .is('deleted_at', null)
      .maybeSingle()

    if (!widget) {
      return NextResponse.json(
        { error: 'Widget não encontrado' },
        { status: 401 },
      )
    }

    // 3. Descobre o setor anfitrião do widget
    const { data: host } = await supabase
      .from('widget_sector_mapping')
      .select('setor_id')
      .eq('widget_id', widget.id)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!host) {
      return NextResponse.json(
        { error: 'Widget sem setor configurado' },
        { status: 403 },
      )
    }

    // 4. O setor escolhido (do token) precisa ser um destino válido do
    //    Roteamento de Atendimento do setor anfitrião.
    const { data: rota } = await supabase
      .from('setor_tipos_atendimento')
      .select('id')
      .eq('setor_id', host.setor_id)
      .eq('setor_destino_id', setor_id)
      .limit(1)
      .maybeSingle()

    if (!rota) {
      return NextResponse.json(
        { error: 'Setor não disponível neste widget' },
        { status: 403 },
      )
    }

    // 4. Reaproveita ticket aberto deste cliente + setor, se houver
    const { data: ticketAberto } = await supabase
      .from('tickets')
      .select('id, colaborador_id')
      .eq('cliente_id', cliente_id)
      .eq('setor_id', setor_id)
      .in('status', ['aberto', 'em_atendimento'])
      .maybeSingle()

    if (ticketAberto) {
      return NextResponse.json(
        {
          ticket_id: ticketAberto.id,
          status: ticketAberto.colaborador_id ? 'atribuido' : 'fila',
          mensagem: 'Ticket existente',
        },
        { status: 200 },
      )
    }

    // 5. Cria novo ticket
    const { data: novoTicket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        cliente_id,
        setor_id,
        status: 'aberto',
        canal: widget.canal || 'widget',
        prioridade: 'normal',
      })
      .select('id')
      .single()

    if (ticketError) {
      console.error('Error creating ticket:', ticketError)
      return NextResponse.json(
        { error: 'Erro ao criar ticket' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        ticket_id: novoTicket.id,
        status: 'criado',
        mensagem: 'Ticket criado com sucesso',
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('Widget ticket create error:', error)
    return NextResponse.json(
      { error: 'Erro ao criar ticket' },
      { status: 500 },
    )
  }
}
