import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/tickets/acompanhamento
 *
 * Marca ou desmarca que um gestor está acompanhando o atendimento — o caso de
 * quando ele entra para ajudar o técnico. Um ticket tem no máximo um
 * acompanhante; parar de acompanhar apaga a linha.
 *
 * Quem acompanha é sempre QUEM ESTÁ LOGADO, tirado da sessão. O corpo não
 * escolhe o colaborador de propósito: marcar outra pessoa como responsável por
 * um acompanhamento que ela não sabe que tem é pior que não ter o campo.
 *
 * Body:
 * - ticket_id: string (obrigatório)
 * - acompanhar: boolean (obrigatório) — true entra, false sai
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const ticketId: string | undefined = body?.ticket_id
    const acompanhar = body?.acompanhar

    if (!ticketId || typeof acompanhar !== 'boolean') {
      return NextResponse.json(
        { error: 'ticket_id e acompanhar (boolean) são obrigatórios' },
        { status: 400 },
      )
    }

    const sessao = await createClient()
    const { data: { user } } = await sessao.auth.getUser()
    if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()

    const { data: colaborador, error: colaboradorError } = await db
      .from('colaboradores')
      .select('id, nome')
      .eq('email', user.email)
      .maybeSingle()

    if (colaboradorError) {
      console.error('[Acompanhamento] erro ao buscar colaborador:', colaboradorError.message)
      return NextResponse.json({ error: 'Erro ao identificar o gestor' }, { status: 500 })
    }
    if (!colaborador) {
      return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 })
    }

    if (!acompanhar) {
      // Só sai quem entrou: sem o filtro por colaborador, um gestor tiraria o
      // acompanhamento do outro sem querer, ao abrir a mesma conversa.
      const { error } = await db
        .from('ticket_acompanhamentos')
        .delete()
        .eq('ticket_id', ticketId)
        .eq('colaborador_id', colaborador.id)

      if (error) {
        console.error('[Acompanhamento] erro ao encerrar:', error.message)
        return NextResponse.json({ error: 'Erro ao encerrar o acompanhamento' }, { status: 500 })
      }

      return NextResponse.json({ acompanhamento: null })
    }

    const linha = {
      ticket_id: ticketId,
      colaborador_id: colaborador.id,
      colaborador_nome: colaborador.nome,
      iniciado_em: new Date().toISOString(),
    }

    const { data: salvo, error } = await db
      .from('ticket_acompanhamentos')
      .insert(linha)
      .select('ticket_id, colaborador_id, colaborador_nome, iniciado_em')
      .maybeSingle()

    if (error?.code === '23505') {
      const { data: existente, error: existenteError } = await db
        .from('ticket_acompanhamentos')
        .select('ticket_id, colaborador_id, colaborador_nome, iniciado_em')
        .eq('ticket_id', ticketId)
        .maybeSingle()

      if (existenteError || !existente) {
        console.error('[Acompanhamento] erro ao consultar acompanhamento existente:', existenteError?.message)
        return NextResponse.json({ error: 'Erro ao registrar o acompanhamento' }, { status: 500 })
      }

      if (existente.colaborador_id !== colaborador.id) {
        return NextResponse.json(
          { error: 'Outro gestor já está acompanhando este atendimento' },
          { status: 409 },
        )
      }

      return NextResponse.json({ acompanhamento: existente })
    }

    if (error) {
      console.error('[Acompanhamento] erro ao registrar:', error.message)
      return NextResponse.json({ error: 'Erro ao registrar o acompanhamento' }, { status: 500 })
    }

    return NextResponse.json({ acompanhamento: salvo ?? linha })
  } catch (erro) {
    console.error('[Acompanhamento] erro inesperado:', erro)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
