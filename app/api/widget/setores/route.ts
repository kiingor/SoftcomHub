import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Rótulos dos tipos de atendimento (espelham o "Roteamento de Atendimento" do setor).
const TIPO_LABELS: Record<string, string> = {
  suporte: 'Suporte Técnico',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  ouvidoria: 'Ouvidoria',
  implantacao: 'Implantação',
}

/**
 * Opções do widget = Roteamento de Atendimento do setor anfitrião.
 * Cada tipo configurado (com setor de destino) vira uma opção; ao escolher,
 * o cliente é roteado para o setor de destino daquele tipo.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const widgetKey = searchParams.get('widget_key')

    if (!widgetKey) {
      return NextResponse.json(
        { error: 'widget_key é obrigatório' },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()

    // 1. Valida widget
    const { data: widget } = await supabase
      .from('widget_configs')
      .select('id')
      .eq('api_key', widgetKey)
      .is('deleted_at', null)
      .maybeSingle()

    if (!widget) {
      return NextResponse.json(
        { error: 'Widget não encontrado' },
        { status: 401 },
      )
    }

    // 2. Descobre o setor anfitrião (vínculo do widget)
    const { data: host } = await supabase
      .from('widget_sector_mapping')
      .select('setor_id')
      .eq('widget_id', widget.id)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!host) {
      return NextResponse.json({ setores: [] }, { status: 200 })
    }

    // 3. Opções vêm do Roteamento de Atendimento desse setor
    const { data: rotas } = await supabase
      .from('setor_tipos_atendimento')
      .select('tipo, setor_destino_id')
      .eq('setor_id', host.setor_id)
      .not('setor_destino_id', 'is', null)
      .neq('tipo', 'implantacao') // Implantação não é ofertada no widget

    const destIds = [
      ...new Set((rotas || []).map((r: any) => r.setor_destino_id)),
    ]

    let nameMap: Record<string, string> = {}
    if (destIds.length > 0) {
      const { data: setoresData } = await supabase
        .from('setores')
        .select('id, nome')
        .in('id', destIds)
      nameMap = Object.fromEntries(
        (setoresData || []).map((s: any) => [s.id, s.nome]),
      )
    }

    const setores = (rotas || []).map((r: any) => ({
      id: r.setor_destino_id,
      tipo: r.tipo,
      nome: TIPO_LABELS[r.tipo] || r.tipo,
      destino_nome: nameMap[r.setor_destino_id] || null,
    }))

    return NextResponse.json({ setores }, { status: 200 })
  } catch (error) {
    console.error('Widget setores error:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar setores' },
      { status: 500 },
    )
  }
}
