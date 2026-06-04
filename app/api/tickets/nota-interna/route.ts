import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/tickets/nota-interna
 *
 * Registra uma NOTA INTERNA do supervisor num ticket. A nota:
 * - é salva em `mensagens` com remetente='supervisor';
 * - NÃO recebe campos de canal (phone_number_id/canal_envio/discord_user_id);
 * - NÃO é despachada para nenhum canal (não chamamos os endpoints de envio).
 * Logo, ela nunca chega ao cliente — só aparece para o atendente/supervisor,
 * renderizada em cor distinta no workdesk e no painel do setor.
 *
 * Body:
 * - ticket_id: string (obrigatório)
 * - conteudo: string (obrigatório)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const ticket_id: string | undefined = body?.ticket_id
    const conteudo: string = (body?.conteudo ?? '').toString().trim()
    const autor_nome: string | null = (body?.autor_nome ?? '').toString().trim() || null

    if (!ticket_id || !conteudo) {
      return NextResponse.json(
        { error: 'ticket_id e conteudo são obrigatórios' },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()

    // Amarra a nota ao chat: pega cliente_id do ticket (e valida que existe).
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, cliente_id')
      .eq('id', ticket_id)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
    }

    const { data: message, error: insertError } = await supabase
      .from('mensagens')
      .insert({
        ticket_id: ticket.id,
        cliente_id: ticket.cliente_id,
        remetente: 'supervisor',
        autor_nome,
        conteudo,
        tipo: 'texto',
        enviado_em: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('[NotaInterna] Erro ao inserir nota:', insertError)
      return NextResponse.json({ error: 'Erro ao enviar nota interna' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message })
  } catch (error) {
    console.error('[NotaInterna] Erro inesperado:', error)
    return NextResponse.json(
      { error: 'Erro interno', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    )
  }
}
