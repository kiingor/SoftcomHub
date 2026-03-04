import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { request as undiciRequest } from 'undici'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { cnpj } = await request.json()

    if (!cnpj) {
      return NextResponse.json({ error: 'CNPJ obrigatorio' }, { status: 400 })
    }

    // Clean CNPJ - remove non-digits
    const cleanCnpj = cnpj.replace(/\D/g, '')

    console.log('[v0] CNPJ Lookup - searching for:', cleanCnpj)

    // 1. First check in local database - use limit(1) to handle duplicates
    const { data: localClientes } = await supabase
      .from('clientes')
      .select('*')
      .eq('CNPJ', cleanCnpj)
      .limit(1)

    let localCliente = localClientes?.[0] || null

    // Fallback: try ilike in case CNPJ is stored with formatting
    if (!localCliente) {
      const { data: localClientesFormatted } = await supabase
        .from('clientes')
        .select('*')
        .ilike('CNPJ', `%${cleanCnpj}%`)
        .limit(1)

      localCliente = localClientesFormatted?.[0] || null
    }

    if (localCliente) {
      return NextResponse.json({
        source: 'local',
        cliente: {
          id: localCliente.id,
          nome: localCliente.nome,
          cnpj: localCliente.CNPJ,
          telefone: localCliente.telefone,
          registro: localCliente.Registro,
        },
      })
    }

    // 2. If not found locally, call external API
    console.log('[v0] CNPJ Lookup - not found locally, calling external API for:', cleanCnpj)
    
    const { statusCode, body: responseBody } = await undiciRequest(
      'https://n8n-webhook.mensageria.softcomtecnologia.com/webhook/getcliente',
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ cnpj: cleanCnpj }]),
      }
    )
    
    const externalResponseText = await responseBody.text()
    console.log('[v0] CNPJ Lookup - external response status:', statusCode, 'body:', externalResponseText)
    
    if (statusCode !== 200) {
      return NextResponse.json({
        source: 'not_found',
        message: 'Cliente nao encontrado',
      })
    }

    const externalData = JSON.parse(externalResponseText)

    console.log('[v0] CNPJ Lookup - external data:', externalData)

    if (externalData.message) {
      return NextResponse.json({
        source: 'not_found',
        message: 'Cliente nao encontrado',
      })
    }

    // Return external data
    return NextResponse.json({
      source: 'external',
      cliente: {
        nome: externalData.nome_cliente,
        cnpj: externalData.cnpj,
        registro: externalData.id,
      },
    })
  } catch (error) {
    console.error('[v0] CNPJ Lookup Error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
