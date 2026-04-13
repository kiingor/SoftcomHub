import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/clientes
 * 
 * Cadastra um novo cliente ou atualiza um existente.
 * A identificacao do cliente e feita pelo telefone (campo unico).
 * 
 * Body:
 * - telefone: string (obrigatorio) - usado para identificar o cliente
 * - nome?: string
 * - email?: string
 * - documento?: string
 * - PDV?: string
 * - CNPJ?: string
 * - Registro?: string
 * 
 * Retorna:
 * - created: true se criou novo cliente, false se atualizou existente
 * - cliente: dados do cliente
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { telefone, nome, email, documento, PDV, CNPJ, Registro } = body

    // Telefone e obrigatorio para identificar o cliente
    if (!telefone) {
      return NextResponse.json(
        { error: 'Telefone e obrigatorio' },
        { status: 400 }
      )
    }

    // Normalizar telefone (remover caracteres especiais)
    const telefoneNormalizado = telefone.replace(/\D/g, '')

    // Upsert: insere ou atualiza baseado no telefone (constraint unique)
    const upsertData: Record<string, unknown> = {
      telefone: telefoneNormalizado,
    }
    if (nome !== undefined) upsertData.nome = nome
    if (email !== undefined) upsertData.email = email
    if (documento !== undefined) upsertData.documento = documento
    if (PDV !== undefined) upsertData.PDV = PDV
    if (CNPJ !== undefined) upsertData.CNPJ = CNPJ
    if (Registro !== undefined) upsertData.Registro = Registro

    const { data: cliente, error: upsertError } = await supabase
      .from('clientes')
      .upsert(upsertData, { onConflict: 'telefone', ignoreDuplicates: false })
      .select()
      .single()

    if (upsertError) {
      console.error('Erro ao upsert cliente:', upsertError)
      return NextResponse.json(
        { error: 'Erro ao cadastrar/atualizar cliente', details: upsertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      created: true,
      message: 'Cliente processado com sucesso',
      cliente,
    }, { status: 201 })

  } catch (error) {
    console.error('Erro no endpoint de clientes:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/clientes
 * 
 * Lista clientes ou busca por telefone
 * 
 * Query params:
 * - telefone?: string - busca por telefone
 * - search?: string - busca por nome ou telefone
 * - limit?: number - limite de resultados (default: 50)
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const telefone = searchParams.get('telefone')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('clientes')
      .select('*')
      .order('nome')
      .limit(limit)

    // Busca por telefone exato
    if (telefone) {
      const telefoneNormalizado = telefone.replace(/\D/g, '')
      query = query.eq('telefone', telefoneNormalizado)
    }

    // Busca por termo (nome ou telefone)
    if (search) {
      query = query.or(`nome.ilike.%${search}%,telefone.ilike.%${search}%`)
    }

    const { data: clientes, error } = await query

    if (error) {
      console.error('Erro ao buscar clientes:', error)
      return NextResponse.json(
        { error: 'Erro ao buscar clientes', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      clientes,
      total: clientes?.length || 0,
    })

  } catch (error) {
    console.error('Erro no endpoint de clientes:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
