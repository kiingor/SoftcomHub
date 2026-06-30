import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { validatePainelAuth } from '@/lib/painel-auth'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ widgetId: string; mappingId: string }> },
) {
  const authError = validatePainelAuth(request)
  if (authError) return authError

  try {
    const { widgetId, mappingId } = await context.params
    const supabase = createServiceClient()

    // Verifica se mapeamento pertence ao widget
    const { data: mapping, error: checkError } = await supabase
      .from('widget_sector_mapping')
      .select('id')
      .eq('id', mappingId)
      .eq('widget_id', widgetId)
      .single()

    if (checkError || !mapping) {
      return NextResponse.json(
        { error: 'Mapeamento não encontrado' },
        { status: 404 },
      )
    }

    // Deleta mapeamento
    const { error } = await supabase
      .from('widget_sector_mapping')
      .delete()
      .eq('id', mappingId)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error deleting widget sector:', error)
    return NextResponse.json(
      { error: 'Erro ao remover setor' },
      { status: 500 },
    )
  }
}
