import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const searchParams = request.nextUrl.searchParams
  const q = (searchParams.get('q') || '').trim()
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)))

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('clientes')
    .select('id, nome, telefone, CNPJ, Registro', { count: 'exact' })
    .not('CNPJ', 'is', null)
    .neq('CNPJ', '')
    .not('Registro', 'is', null)
    .neq('Registro', '')
    .order('nome', { ascending: true, nullsFirst: false })
    .range(from, to)

  if (q) {
    const digits = q.replace(/\D/g, '')
    const filters: string[] = []
    filters.push(`nome.ilike.%${q}%`)
    if (digits.length > 0) {
      filters.push(`telefone.ilike.%${digits}%`)
      filters.push(`CNPJ.ilike.%${digits}%`)
    }
    filters.push(`Registro.ilike.%${q}%`)
    query = query.or(filters.join(','))
  }

  const { data, count, error } = await query

  if (error) {
    console.error('[api/setores/clientes] erro:', error)
    return NextResponse.json({ error: 'Erro ao buscar clientes' }, { status: 500 })
  }

  return NextResponse.json({
    clientes: data || [],
    total: count || 0,
    page,
    pageSize,
  })
}
