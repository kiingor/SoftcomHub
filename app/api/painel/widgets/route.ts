import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { validatePainelAuth } from '@/lib/painel-auth'

export async function GET(request: NextRequest) {
  const authError = validatePainelAuth(request)
  if (authError) return authError

  try {
    const supabase = createServiceClient()

    const { data: widgets, error } = await supabase
      .from('widget_configs')
      .select('id, api_key, nome, descricao, allowed_domains, max_queue_size, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json({ widgets }, { status: 200 })
  } catch (error) {
    console.error('Error fetching widgets:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar widgets' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const authError = validatePainelAuth(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { nome, descricao, allowed_domains, max_queue_size } = body

    if (!nome) {
      return NextResponse.json(
        { error: 'Nome é obrigatório' },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()

    const { data: widget, error } = await supabase
      .from('widget_configs')
      .insert({
        api_key: `sk_widget_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        nome,
        descricao: descricao || null,
        allowed_domains: allowed_domains || [],
        max_queue_size: max_queue_size || null,
      })
      .select('id, api_key, nome, descricao, allowed_domains, max_queue_size, created_at')
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ widget }, { status: 201 })
  } catch (error) {
    console.error('Error creating widget:', error)
    return NextResponse.json(
      { error: 'Erro ao criar widget' },
      { status: 500 },
    )
  }
}
