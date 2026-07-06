import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET /api/setores/[id]/avaliacao
 *
 * Consultado pelo n8n (Maestro) após o encerramento do ticket, passando o id do
 * setor, para saber se deve disparar a pesquisa de avaliação naquele setor.
 *
 * Retorna { setor_id, avaliar, encontrado }. `avaliar` é controlado pelo Switch
 * "Avaliação" do setor: ativo por padrão (webhook_eventos null) e desligado
 * quando o setor salva sem a flag 'avaliacao'.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'setor id é obrigatório' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: setor, error } = await supabase
    .from('setores')
    .select('id, webhook_eventos')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!setor) {
    return NextResponse.json({ setor_id: id, avaliar: false, encontrado: false }, { status: 404 })
  }

  const eventos = setor.webhook_eventos as string[] | null
  // Ativo por padrão: null (nunca configurado) = avaliar. Caso contrário, só se a
  // flag 'avaliacao' estiver presente.
  const avaliar = eventos == null || eventos.includes('avaliacao')

  return NextResponse.json({ setor_id: setor.id, avaliar, encontrado: true })
}
