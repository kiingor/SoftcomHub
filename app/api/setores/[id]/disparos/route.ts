import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getEvolutionCreds,
  processarDisparoLote,
  type DestinatarioInput,
} from '@/lib/disparo-processor'

export const maxDuration = 300

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: setorId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const searchParams = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, count, error } = await supabase
    .from('disparos_lote')
    .select(
      'id, tipo_origem, mensagem, destino_tipo, subsetor_id, atendentes_ids, total_destinatarios, total_enviados, total_falhados, status, criado_em, concluido_em, colaboradores(nome), subsetores(nome)',
      { count: 'exact' },
    )
    .eq('setor_id', setorId)
    .order('criado_em', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('[api/setores/disparos] GET erro:', error)
    return NextResponse.json({ error: 'Erro ao buscar disparos' }, { status: 500 })
  }

  return NextResponse.json({ lotes: data || [], total: count || 0, page, pageSize })
}

interface PostBody {
  tipo_origem: 'xls' | 'clientes_hub'
  destinatarios: DestinatarioInput[]
  mensagem: string
  destino_tipo: 'subsetor' | 'atendentes'
  subsetor_id?: string | null
  atendentes_ids?: string[] | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: setorId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as PostBody
  const {
    tipo_origem,
    destinatarios,
    mensagem,
    destino_tipo,
    subsetor_id = null,
    atendentes_ids = null,
  } = body

  if (!tipo_origem || !['xls', 'clientes_hub'].includes(tipo_origem)) {
    return NextResponse.json({ error: 'tipo_origem inválido' }, { status: 400 })
  }
  if (!mensagem || mensagem.trim().length < 5) {
    return NextResponse.json({ error: 'mensagem muito curta' }, { status: 400 })
  }
  if (!destino_tipo || !['subsetor', 'atendentes'].includes(destino_tipo)) {
    return NextResponse.json({ error: 'destino_tipo inválido' }, { status: 400 })
  }
  if (destino_tipo === 'subsetor' && !subsetor_id) {
    return NextResponse.json({ error: 'subsetor_id obrigatório' }, { status: 400 })
  }
  if (destino_tipo === 'atendentes' && (!atendentes_ids || atendentes_ids.length === 0)) {
    return NextResponse.json({ error: 'atendentes_ids obrigatório' }, { status: 400 })
  }
  if (!Array.isArray(destinatarios) || destinatarios.length === 0) {
    return NextResponse.json({ error: 'destinatarios vazio' }, { status: 400 })
  }
  if (destinatarios.length > 500) {
    return NextResponse.json({ error: 'máximo 500 destinatários por disparo' }, { status: 400 })
  }

  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('id, setor_id')
    .eq('email', user.email)
    .single()

  if (!colaborador) {
    return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 })
  }

  const service = createServiceClient()

  const { data: setor } = await service
    .from('setores')
    .select('id, nome, max_disparos_dia')
    .eq('id', setorId)
    .single()

  if (!setor) {
    return NextResponse.json({ error: 'Setor não encontrado' }, { status: 404 })
  }

  const creds = await getEvolutionCreds(service, setorId)
  if (!creds) {
    return NextResponse.json(
      { error: 'Setor sem Evolution configurada. Configure em Configurações.' },
      { status: 422 },
    )
  }

  const maxDia = setor.max_disparos_dia || 1000
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const { count: countHoje } = await service
    .from('disparo_logs')
    .select('id', { count: 'exact', head: true })
    .eq('setor_id', setorId)
    .gte('created_at', hoje.toISOString())

  const usados = countHoje || 0
  const restante = Math.max(0, maxDia - usados)
  if (destinatarios.length > restante) {
    return NextResponse.json(
      { error: `Limite diário excedido. Você pode enviar mais ${restante} disparos hoje.` },
      { status: 429 },
    )
  }

  const { data: lote, error: loteErr } = await service
    .from('disparos_lote')
    .insert({
      setor_id: setorId,
      colaborador_id: colaborador.id,
      tipo_origem,
      mensagem,
      destino_tipo,
      subsetor_id: destino_tipo === 'subsetor' ? subsetor_id : null,
      atendentes_ids: destino_tipo === 'atendentes' ? atendentes_ids : null,
      total_destinatarios: destinatarios.length,
      status: 'processando',
    })
    .select('id')
    .single()

  if (loteErr || !lote) {
    console.error('[api/setores/disparos] erro ao criar lote:', loteErr)
    return NextResponse.json({ error: 'Erro ao criar lote' }, { status: 500 })
  }

  const result = await processarDisparoLote({
    supabase: service,
    loteId: lote.id,
    setorId,
    colaboradorCriadorId: colaborador.id,
    mensagem,
    destinoTipo: destino_tipo,
    subsetorId: subsetor_id,
    atendentesIds: atendentes_ids,
    destinatarios,
    creds,
  })

  const finalStatus = result.total_enviados === 0 ? 'falhado' : 'concluido'

  await service
    .from('disparos_lote')
    .update({
      status: finalStatus,
      total_enviados: result.total_enviados,
      total_falhados: result.total_falhados,
      concluido_em: new Date().toISOString(),
    })
    .eq('id', lote.id)

  return NextResponse.json({
    lote_id: lote.id,
    total_enviados: result.total_enviados,
    total_falhados: result.total_falhados,
    falhas: result.falhas,
  })
}
