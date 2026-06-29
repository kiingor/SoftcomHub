import { NextRequest, NextResponse } from 'next/server'
import { clienteWidgetUpsert } from '@/lib/services/cliente-widget-upsert'
import { SignJWT } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'dev-secret-key',
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cnpj, nome, telefone, setor_id } = body

    // Validações: nome + setor sempre; e telefone OU cnpj para identificar.
    if (!nome || !setor_id) {
      return NextResponse.json(
        { error: 'nome e setor_id são obrigatórios' },
        { status: 400 },
      )
    }

    const temTelefone =
      typeof telefone === 'string' && telefone.replace(/\D/g, '').length >= 10
    const cnpjLimpo = cnpj ? String(cnpj).replace(/\D/g, '') : undefined

    if (!temTelefone && !cnpjLimpo) {
      return NextResponse.json(
        { error: 'Informe um telefone com DDD ou um CNPJ' },
        { status: 400 },
      )
    }

    // Busca ou cria cliente (resolve o cliente_id que vai no JWT)
    const { cliente_id, status, cliente } = await clienteWidgetUpsert({
      telefone: temTelefone ? telefone : undefined,
      nome,
      cnpj: cnpjLimpo,
    })

    // Gera JWT válido por 24 horas
    const token = await new SignJWT({
      cliente_id,
      setor_id,
      tipo: 'widget',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(JWT_SECRET)

    return NextResponse.json(
      {
        success: true,
        token,
        cliente_id,
        cliente_nome: cliente.nome,
        status,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('Widget auth error:', error)
    return NextResponse.json(
      { error: 'Erro na autenticação' },
      { status: 500 },
    )
  }
}
