import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const API_URL = process.env.SOFTCOM_API_URL || 'https://api.softcom.cloud/v1'
const API_KEY = process.env.SOFTCOM_API_KEY || ''

/**
 * Proxy para a API externa de busca de cliente (por CNPJ/nome).
 * A chave fica só no servidor. Exige widget_key válido para evitar abuso.
 * Resposta: { empresas: [{ id, nome, razaoSocial, cnpj, cidade, uf, contato }] }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const widgetKey = searchParams.get('widget_key')
    const q = (searchParams.get('q') || '').trim()

    if (!widgetKey) {
      return NextResponse.json({ error: 'widget_key é obrigatório' }, { status: 400 })
    }
    if (q.length < 3) {
      return NextResponse.json({ empresas: [] })
    }

    // valida widget (evita uso do proxy fora do widget)
    const supabase = createServiceClient()
    const { data: widget } = await supabase
      .from('widget_configs')
      .select('id')
      .eq('api_key', widgetKey)
      .is('deleted_at', null)
      .maybeSingle()
    if (!widget) {
      return NextResponse.json({ error: 'Widget não encontrado' }, { status: 401 })
    }

    if (!API_KEY) {
      console.error('SOFTCOM_API_KEY não configurada')
      return NextResponse.json({ error: 'Busca indisponível' }, { status: 503 })
    }

    const res = await fetch(
      `${API_URL}/busca-cliente?q=${encodeURIComponent(q)}`,
      { headers: { 'x-api-key': API_KEY } },
    )
    if (!res.ok) {
      return NextResponse.json({ empresas: [] })
    }

    const data = await res.json()
    const empresas = (Array.isArray(data) ? data : []).map((c: any) => {
      const contato =
        Array.isArray(c.contatos) && c.contatos[0]
          ? { ddd: c.contatos[0].ddd || '', telefone: c.contatos[0].telefone || '' }
          : null
      return {
        id: c.id,
        nome: (c.nome || '').trim() || c.razaoSocial || 'Empresa',
        razaoSocial: c.razaoSocial || '',
        cnpj: c.cnpj || '',
        cidade: c.cidade || '',
        uf: c.uf || '',
        contato,
      }
    })

    return NextResponse.json({ empresas })
  } catch (e) {
    console.error('buscar-cliente error:', e)
    return NextResponse.json({ error: 'Erro na busca' }, { status: 500 })
  }
}
