import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase'

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; widgetId: string; mappingId: string }> },
) {
  const { widgetId, mappingId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()

  // Não permite remover o último setor — o widget ficaria sem destino.
  const { count } = await db
    .from('widget_sector_mapping')
    .select('id', { count: 'exact', head: true })
    .eq('widget_id', widgetId)

  if ((count || 0) <= 1) {
    return NextResponse.json(
      { error: 'O widget precisa de pelo menos um setor' },
      { status: 400 },
    )
  }

  const { error } = await db
    .from('widget_sector_mapping')
    .delete()
    .eq('id', mappingId)
    .eq('widget_id', widgetId)

  if (error) {
    console.error('Erro ao remover setor:', error)
    return NextResponse.json({ error: 'Erro ao remover setor' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
