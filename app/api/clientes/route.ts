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

    // Verificar se cliente ja existe
    const { data: clienteExistente } = await supabase
      .from('clientes')
      .select('*')
      .eq('telefone', telefoneNormalizado)
      .maybeSingle()

    if (clienteExistente) {
      // Cliente existe - atualizar dados
      const updateData: Record<string, unknown> = {}

      if (nome !== undefined) updateData.nome = nome
      if (email !== undefined) updateData.email = email
      if (documento !== undefined) updateData.documento = documento
      if (PDV !== undefined) updateData.PDV = PDV
      if (CNPJ !== undefined) updateData.CNPJ = CNPJ
      if (Registro !== undefined) updateData.Registro = Registro

      // So atualiza se houver dados para atualizar
      if (Object.keys(updateData).length > 0) {
        const { data: clienteAtualizado, error: updateError } = await supabase
          .from('clientes')
          .update(updateData)
          .eq('id', clienteExistente.id)
          .select()
          .single()

        if (updateError) {
          console.error('Erro ao atualizar cliente:', updateError)
          return NextResponse.json(
            { error: 'Erro ao atualizar cliente', details: updateError.message },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          created: false,
          message: 'Cliente atualizado com sucesso',
          cliente: clienteAtualizado,
        })
      }

      // Nenhum dado para atualizar, retorna cliente existente
      return NextResponse.json({
        success: true,
        created: false,
        message: 'Cliente ja cadastrado, nenhuma alteracao necessaria',
        cliente: clienteExistente,
      })
    }

    // Cliente nao existe - criar novo
    const { data: novoCliente, error: insertError } = await supabase
      .from('clientes')
      .insert({
        telefone: telefoneNormalizado,
        nome: nome || null,
        email: email || null,
        documento: documento || null,
        PDV: PDV || null,
        CNPJ: CNPJ || null,
        Registro: Registro || null,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Erro ao criar cliente:', insertError)
      return NextResponse.json(
        { error: 'Erro ao criar cliente', details: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      created: true,
      message: 'Cliente cadastrado com sucesso',
      cliente: novoCliente,
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
