import { NextRequest, NextResponse } from 'next/server'
import { isDocumentoValido, normalizeDocumento } from '@/lib/documento-cliente'
import { createClient } from '@/lib/supabase/server'

const MDM_ENDPOINT = 'https://agent.softcomapps.com/api/v1/svc/mdm'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const cnpj = normalizeDocumento(request.nextUrl.searchParams.get('cnpj'))
    if (!isDocumentoValido(cnpj)) {
      return NextResponse.json({ error: 'Informe um CNPJ válido' }, { status: 400 })
    }

    const apiKey = process.env.SOFTCOM_MDM_API_KEY
    if (!apiKey) {
      console.error('[mdm] SOFTCOM_MDM_API_KEY não configurada')
      return NextResponse.json({ error: 'Consulta de MDM não configurada' }, { status: 500 })
    }

    const url = `${MDM_ENDPOINT}?cnpj=${cnpj}&limit=100&offset=0`
    const mdmResponse = await fetch(url, {
      headers: { 'X-API-Key': apiKey },
      cache: 'no-store',
    })

    if (!mdmResponse.ok) {
      console.error('[mdm] Resposta não-OK do serviço de MDM:', mdmResponse.status)
      return NextResponse.json({ error: 'Falha ao consultar o MDM' }, { status: 502 })
    }

    const data = await mdmResponse.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[mdm] Erro:', error)
    return NextResponse.json({ error: 'Erro interno ao consultar o MDM' }, { status: 500 })
  }
}
