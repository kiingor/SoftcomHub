import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase'

const TIPO_LABELS: Record<string, string> = {
  suporte: 'Suporte Técnico',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  ouvidoria: 'Ouvidoria',
  implantacao: 'Implantação',
}

/**
 * Gestão de widgets de chat a partir de um setor.
 * Autenticação: sessão do colaborador (mesmo modelo das demais rotas /api/setores).
 * As opções do widget vêm do "Roteamento de Atendimento" do setor — não há
 * adição manual de setores. O CRUD usa service role (sem RLS novo em prod).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: setorId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()

  // Widgets hospedados por este setor
  const { data: maps } = await db
    .from('widget_sector_mapping')
    .select('widget_id')
    .eq('setor_id', setorId)

  const widgetIds = [...new Set((maps || []).map((m: any) => m.widget_id))]

  let widgets: any[] = []
  if (widgetIds.length > 0) {
    const { data: configs } = await db
      .from('widget_configs')
      .select('id, api_key, nome, canal, allowed_domains, created_at')
      .in('id', widgetIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    widgets = configs || []
  }

  // Preview das opções: Roteamento de Atendimento deste setor
  const { data: rotas } = await db
    .from('setor_tipos_atendimento')
    .select('tipo, setor_destino_id')
    .eq('setor_id', setorId)
    .not('setor_destino_id', 'is', null)
    .neq('tipo', 'implantacao') // Implantação não é ofertada no widget

  const destIds = [...new Set((rotas || []).map((r: any) => r.setor_destino_id))]
  let nameMap: Record<string, string> = {}
  if (destIds.length > 0) {
    const { data: setoresData } = await db
      .from('setores')
      .select('id, nome')
      .in('id', destIds)
    nameMap = Object.fromEntries(
      (setoresData || []).map((s: any) => [s.id, s.nome]),
    )
  }

  const routing = (rotas || []).map((r: any) => ({
    tipo: r.tipo,
    label: TIPO_LABELS[r.tipo] || r.tipo,
    destino_nome: nameMap[r.setor_destino_id] || null,
  }))

  return NextResponse.json({ widgets, routing })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: setorId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { nome, allowed_domains, canal } = body
  if (!nome) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: widget, error } = await db
    .from('widget_configs')
    .insert({
      api_key: `sk_widget_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      nome,
      canal: (canal && String(canal).trim()) || null,
      allowed_domains: allowed_domains || [],
    })
    .select('id, api_key, nome, canal, allowed_domains, created_at')
    .single()

  if (error || !widget) {
    console.error('Erro ao criar widget:', error)
    return NextResponse.json({ error: 'Erro ao criar widget' }, { status: 500 })
  }

  // Vincula este setor como anfitrião do widget (define de qual roteamento
  // o widget puxa as opções).
  await db.from('widget_sector_mapping').insert({
    widget_id: widget.id,
    setor_id: setorId,
    display_order: 1,
  })

  return NextResponse.json({ widget }, { status: 201 })
}
