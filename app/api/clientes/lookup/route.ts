import { NextRequest, NextResponse } from 'next/server'
import { lookupSoftcomClientByCnpj } from '@/lib/softcom-client'
import { createClient } from '@/lib/supabase/server'

const CLIENT_SELECT = 'id, nome, telefone, email, CNPJ, Registro, PDV'

function normalizeCnpj(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : ''
}

function cnpjVariants(cnpj: string) {
  const formatted = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  return formatted === cnpj ? [cnpj] : [cnpj, formatted]
}

function toClientResponse(cliente: Record<string, any>) {
  const cnpj = cliente.CNPJ ?? cliente.cnpj ?? null
  const registro = cliente.Registro ?? cliente.registro ?? null
  const pdv = cliente.PDV ?? cliente.pdv ?? null

  return {
    id: cliente.id ?? null,
    nome: cliente.nome || 'Cliente sem nome',
    telefone: cliente.telefone ?? null,
    email: cliente.email ?? null,
    CNPJ: cnpj,
    Registro: registro,
    PDV: pdv,
    cnpj,
    registro,
    pdv,
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const normalizedCnpj = normalizeCnpj(body?.cnpj)
    if (normalizedCnpj.length !== 14) {
      return NextResponse.json({ error: 'Informe um CNPJ válido' }, { status: 400 })
    }

    const { data: localClientes, error: localError } = await supabase
      .from('clientes')
      .select(CLIENT_SELECT)
      .in('CNPJ', cnpjVariants(normalizedCnpj))
      .limit(1)

    if (localError) {
      console.error('[clientes/lookup] Erro ao buscar cliente local:', localError)
      return NextResponse.json({ error: 'Não foi possível buscar o cliente' }, { status: 500 })
    }

    const localCliente = localClientes?.[0]
    if (localCliente) {
      return NextResponse.json({ source: 'local', cliente: toClientResponse(localCliente) })
    }

    const externalCliente = await lookupSoftcomClientByCnpj(normalizedCnpj)
    if (!externalCliente) {
      return NextResponse.json({ source: 'not_found', message: 'Cliente não encontrado' })
    }

    return NextResponse.json({
      source: 'external',
      cliente: toClientResponse({
        id: null,
        email: null,
        ...externalCliente,
      }),
    })
  } catch (error) {
    console.error('[clientes/lookup] Erro:', error)
    return NextResponse.json({ error: 'Erro interno ao buscar o cliente' }, { status: 500 })
  }
}
