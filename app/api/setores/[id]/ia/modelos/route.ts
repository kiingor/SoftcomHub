import { NextResponse } from 'next/server'
import { buildAiEndpointUrl, usaProvedorProprio } from '@/lib/ai-provider'
import { requireAdmin } from '@/lib/auth/require-admin'
import { carregarConfigIaDoSetor } from '@/lib/server/setor-ia-config'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET /api/setores/[id]/ia/modelos
 *
 * Catálogo de modelos do provedor configurado no setor, para o seletor da tela
 * de configuração. Passa pelo servidor porque a chamada precisa da chave do
 * setor — que não pode chegar ao navegador.
 *
 * Nunca é erro fatal: se o provedor não expõe /models (ou responde 401), a tela
 * cai para digitar o nome do modelo à mão. Por isso o 200 com `erro` preenchido.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin()
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'setor id é obrigatório' }, { status: 400 })
  }

  const { setor, erro } = await carregarConfigIaDoSetor(createServiceClient(), id)
  if (erro) {
    return NextResponse.json({ error: erro }, { status: 500 })
  }
  if (!setor) {
    return NextResponse.json({ error: 'Setor não encontrado' }, { status: 404 })
  }
  if (!setor.openai_api_key) {
    return NextResponse.json({ modelos: [], erro: 'Salve a chave da API antes de listar os modelos.' })
  }

  let url: string
  try {
    url = usaProvedorProprio(setor)
      ? buildAiEndpointUrl(setor.openai_base_url!, 'models')
      : 'https://api.openai.com/v1/models'
  } catch {
    return NextResponse.json({ modelos: [], erro: 'URL da IA inválida.' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${setor.openai_api_key}` },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return NextResponse.json({ modelos: [], erro: `O provedor respondeu ${res.status} ao listar modelos.` })
    }

    const data = await res.json()
    const modelos = Array.isArray(data?.data)
      ? data.data
          .map((m: { id?: unknown }) => (typeof m?.id === 'string' ? m.id : null))
          .filter((m: string | null): m is string => Boolean(m))
          .sort((a: string, b: string) => a.localeCompare(b))
      : []

    return NextResponse.json({ modelos, erro: null })
  } catch (err: unknown) {
    clearTimeout(timeout)
    const abortado = err instanceof Error && err.name === 'AbortError'
    return NextResponse.json({
      modelos: [],
      erro: abortado ? 'O provedor não respondeu em 10 segundos.' : 'Não foi possível falar com o provedor.',
    })
  }
}
