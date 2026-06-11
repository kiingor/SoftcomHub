import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

function normalizePhone(phone: string | null | undefined) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return `55${digits}`
  if (digits.length === 13 && digits.startsWith('55')) return digits
  return digits || null
}

function isAuthorized(request: NextRequest) {
  const expectedToken = process.env.NEXUS_OCCURRENCE_WEBHOOK_TOKEN
  if (!expectedToken) return true

  const authorization = request.headers.get('authorization') || ''
  const bearerToken = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : null
  const apiKey = request.headers.get('x-api-key')

  return bearerToken === expectedToken || apiKey === expectedToken
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()
    const body = await request.json()
    const {
      telefone,
      cliente_id = null,
      nome_cliente = null,
      setor_id = null,
      ocorrencia_id = null,
      protocolo = null,
      status = 'aberta',
      origem = 'nexus',
      metadata = {},
    } = body

    const normalizedPhone = normalizePhone(telefone)

    if (!cliente_id && !normalizedPhone) {
      return NextResponse.json(
        { error: 'telefone ou cliente_id e obrigatorio' },
        { status: 400 },
      )
    }

    let resolvedClienteId = cliente_id
    let resolvedNomeCliente = nome_cliente

    if (!resolvedClienteId && normalizedPhone) {
      const { data: existingCliente } = await supabase
        .from('clientes')
        .select('id, nome')
        .eq('telefone', normalizedPhone)
        .maybeSingle()

      if (existingCliente) {
        resolvedClienteId = existingCliente.id
        resolvedNomeCliente = resolvedNomeCliente || existingCliente.nome
      } else {
        const { data: newCliente, error: clienteError } = await supabase
          .from('clientes')
          .insert({
            telefone: normalizedPhone,
            nome: resolvedNomeCliente || 'Desconhecido',
          })
          .select('id, nome')
          .single()

        if (clienteError || !newCliente) {
          return NextResponse.json(
            { error: 'Erro ao resolver cliente', details: clienteError?.message },
            { status: 500 },
          )
        }

        resolvedClienteId = newCliente.id
        resolvedNomeCliente = newCliente.nome
      }
    }

    const { data: ocorrencia, error } = await supabase
      .from('nexus_ocorrencias')
      .insert({
        cliente_id: resolvedClienteId,
        telefone: normalizedPhone,
        nome_cliente: resolvedNomeCliente,
        setor_id,
        ocorrencia_id,
        protocolo,
        status,
        origem,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      })
      .select('id, cliente_id, telefone, ocorrencia_id, protocolo, status, criado_em')
      .single()

    if (error || !ocorrencia) {
      return NextResponse.json(
        { error: 'Erro ao registrar ocorrencia', details: error?.message },
        { status: 500 },
      )
    }

    await supabase.from('mensagens').insert({
      cliente_id: resolvedClienteId,
      ticket_id: null,
      remetente: 'sistema',
      conteudo: `Ocorrencia aberta${protocolo ? `: ${protocolo}` : ocorrencia_id ? `: ${ocorrencia_id}` : ''}`,
      tipo: 'texto',
      enviado_em: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, ocorrencia })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro interno' },
      { status: 500 },
    )
  }
}
