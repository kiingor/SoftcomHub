import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@supabase/supabase-js'

/** Cliente para o banco externo de logs (fire-and-forget, sem service role) */
function createExtLogsClient() {
  const url = process.env.LOGS_EXT_SUPABASE_URL
  const key = process.env.LOGS_EXT_SUPABASE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/**
 * POST /api/logs/error
 *
 * Salva um log de erro na tabela error_logs.
 * Faz dual-write: banco principal (service role) + banco externo (fire-and-forget).
 * Sem autenticação obrigatória — erros podem ocorrer antes do login.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tela, rota, log, componente, usuario_id, usuario_nome, navegador, metadata } = body

    if (!tela || !rota || !log) {
      return NextResponse.json({ error: 'Campos obrigatórios: tela, rota, log' }, { status: 400 })
    }

    const payload = {
      tela,
      rota,
      log: typeof log === 'string' ? log : JSON.stringify(log),
      componente: componente || null,
      usuario_id: usuario_id || null,
      usuario_nome: usuario_nome || null,
      navegador: navegador || null,
      metadata: metadata || {},
    }

    const supabase = createServiceClient()

    // Escrita no banco principal
    const { error } = await supabase.from('error_logs').insert(payload)

    if (error) {
      console.error('[ErrorLog API] Erro ao salvar log:', error)
      return NextResponse.json({ error: 'Erro ao salvar log' }, { status: 500 })
    }

    // Espelhamento no banco externo — fire-and-forget, nunca bloqueia a resposta
    const extClient = createExtLogsClient()
    if (extClient) {
      extClient.from('error_logs').insert(payload).then(({ error: extErr }) => {
        if (extErr) console.error('[ErrorLog API] Falha ao espelhar log externo:', extErr.message)
      }).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[ErrorLog API] Erro inesperado:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * PATCH /api/logs/error
 *
 * Marca um log como resolvido/não resolvido.
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, resolvido } = body

    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { error } = await supabase
      .from('error_logs')
      .update({ resolvido: resolvido ?? true })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: 'Erro ao atualizar log' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * DELETE /api/logs/error
 *
 * Remove logs resolvidos ou por ID.
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const clearResolved = searchParams.get('clearResolved')

    const supabase = createServiceClient()

    if (id) {
      await supabase.from('error_logs').delete().eq('id', id)
    } else if (clearResolved === 'true') {
      await supabase.from('error_logs').delete().eq('resolvido', true)
    } else {
      return NextResponse.json({ error: 'Parâmetro obrigatório: id ou clearResolved' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
