import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { validatePainelAuth } from '@/lib/painel-auth'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ widgetId: string }> },
) {
  const authError = validatePainelAuth(request)
  if (authError) return authError

  try {
    const { widgetId } = await context.params
    const supabase = createServiceClient()

    // Busca setores mapeados ao widget
    const { data: mapped, error: mappedError } = await supabase
      .from('widget_sector_mapping')
      .select(
        `
        id,
        setor_id,
        display_order,
        setor_transbordo_id,
        setores!widget_sector_mapping_setor_id_fkey(id, nome),
        transbordo:setores!widget_sector_mapping_setor_transbordo_id_fkey(id, nome)
      `,
      )
      .eq('widget_id', widgetId)
      .order('display_order', { ascending: true })

    if (mappedError) {
      throw mappedError
    }

    // Busca setores NÃO mapeados (disponíveis para adicionar)
    const { data: available, error: availError } = await supabase
      .from('setores')
      .select('id, nome')
      .eq('widget_visible', true)

    if (availError) {
      throw availError
    }

    const mappedIds = (mapped || []).map((m: any) => m.setor_id)
    const availableSetores = (available || []).filter(
      (s: any) => !mappedIds.includes(s.id),
    )

    return NextResponse.json(
      {
        mapped: mapped || [],
        available: availableSetores,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('Error fetching widget sectors:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar setores' },
      { status: 500 },
    )
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ widgetId: string }> },
) {
  const authError = validatePainelAuth(request)
  if (authError) return authError

  try {
    const { widgetId } = await context.params
    const body = await request.json()
    const { setor_id, setor_transbordo_id } = body

    if (!setor_id) {
      return NextResponse.json(
        { error: 'setor_id é obrigatório' },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()

    // Busca o maior display_order existente
    const { data: lastMapping } = await supabase
      .from('widget_sector_mapping')
      .select('display_order')
      .eq('widget_id', widgetId)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()

    const nextOrder = (lastMapping?.display_order || 0) + 1

    // Insere novo mapeamento
    const { data: mapping, error } = await supabase
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
      throw error
    }

    return NextResponse.json({ mapping }, { status: 201 })
  } catch (error) {
    console.error('Error adding sector to widget:', error)
    return NextResponse.json(
      { error: 'Erro ao adicionar setor' },
      { status: 500 },
    )
  }
}
