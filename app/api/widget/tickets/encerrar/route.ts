import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'dev-secret-key',
)

interface JWTPayload {
  cliente_id: string
}

/**
 * Encerra o ticket a partir do widget (cliente). Espelha o encerramento do
 * WorkDesk: status 'encerrado' + encerrado_em. Sem classificação (o atendente
 * pode reclassificar depois, se necessário).
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Token não fornecido' }, { status: 401 })
    }

    let decoded: JWTPayload
    try {
      const verified = await jwtVerify(authHeader.slice(7), JWT_SECRET)
      decoded = verified.payload as unknown as JWTPayload
    } catch {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const { ticket_id } = await request.json()
    if (!ticket_id) {
      return NextResponse.json(
        { error: 'ticket_id é obrigatório' },
        { status: 400 },
      )
    }

    const db = createServiceClient()

    const { data: ticket } = await db
      .from('tickets')
      .select('cliente_id, status')
      .eq('id', ticket_id)
      .maybeSingle()

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
    }
    if (ticket.cliente_id !== decoded.cliente_id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }
    if (ticket.status === 'encerrado') {
      return NextResponse.json({ success: true })
    }

    const { error } = await db
      .from('tickets')
      .update({
        status: 'encerrado',
        encerrado_em: new Date().toISOString(),
      })
      .eq('id', ticket_id)

    if (error) {
      console.error('Erro ao encerrar ticket:', error)
      return NextResponse.json({ error: 'Erro ao encerrar' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Widget encerrar error:', e)
    return NextResponse.json({ error: 'Erro ao encerrar' }, { status: 500 })
  }
}
