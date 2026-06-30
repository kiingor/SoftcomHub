import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; widgetId: string }> },
) {
  const { widgetId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { setor_id, setor_transbordo_id } = body
  if (!setor_id) {
    return NextResponse.json({ error: 'setor_id é obrigatório' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: last } = await db
    .from('widget_sector_mapping')
    .select('display_order')
    .eq('widget_id', widgetId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (last?.display_order || 0) + 1

  const { data: mapping, error } = await db
    .from('widget_sector_mapping')
    .insert({
      widget_id: widgetId,
      setor_id,
      setor_transbordo_id: setor_transbordo_id || null,
      display_order: nextOrder,
    })
    .select('id, setor_id, display_order, setor_transbordo_id')
    .single()

  if (error) {
    // 23505 = violação de unique (setor já está no widget)
    if ((error as any).code === '23505') {
      return NextResponse.json(
        { error: 'Esse setor já está no widget' },
        { status: 409 },
      )
    }
    console.error('Erro ao adicionar setor:', error)
    return NextResponse.json({ error: 'Erro ao adicionar setor' }, { status: 500 })
  }

  return NextResponse.json({ mapping }, { status: 201 })
}
