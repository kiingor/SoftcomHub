import { NextResponse } from 'next/server'
import {
  buildAiEndpointUrl,
  resolverModeloDeChat,
  usaProvedorProprio,
} from '@/lib/ai-provider'
import { carregarConfigIaDoSetor } from '@/lib/server/setor-ia-config'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { mensagem, setor_id } = body

    if (!mensagem || !setor_id) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: mensagem, setor_id' },
        { status: 400 },
      )
    }

    // Use service role to bypass RLS
    const supabase = createServiceClient()

    const { setor, erro: setorError } = await carregarConfigIaDoSetor(supabase, setor_id)

    if (setorError || !setor) {
      return NextResponse.json(
        { error: 'Setor não encontrado' },
        { status: 404 },
      )
    }

    if (!setor.openai_ativo) {
      return NextResponse.json(
        { error: 'OpenAI não está ativa neste setor' },
        { status: 400 },
      )
    }

    if (!setor.openai_api_key) {
      return NextResponse.json(
        { error: 'Chave da OpenAI não configurada neste setor' },
        { status: 400 },
      )
    }

    // Call OpenAI API with 10s timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const chatCompletionsUrl = usaProvedorProprio(setor)
      ? buildAiEndpointUrl(setor.openai_base_url!, 'chat/completions')
      : 'https://api.openai.com/v1/chat/completions'
    const model = resolverModeloDeChat(setor)

    try {
      const openaiResponse = await fetch(chatCompletionsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${setor.openai_api_key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'Você é um assistente de atendimento ao cliente. Melhore sutilmente a mensagem abaixo mantendo a essência, tom e intenção original. Apenas ajuste gramática, clareza e profissionalismo. Não adicione informações novas nem mude o sentido. Responda APENAS com a mensagem melhorada, sem explicações ou aspas.',
            },
            {
              role: 'user',
              content: mensagem,
            },
          ],
          max_tokens: 500,
          temperature: 0.3,
          // Sem isto o gateway da Softcom responde text/event-stream e o
          // response.json() abaixo estoura (verificado em 18/08/2026). A OpenAI
          // aceita a flag do mesmo jeito, então vale para os dois provedores.
          stream: false,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json().catch(() => ({}))
        console.error('[IA] OpenAI API error:', openaiResponse.status, errorData)
        return NextResponse.json(
          { error: `Erro na API da OpenAI: ${openaiResponse.status}` },
          { status: 502 },
        )
      }

      const data = await openaiResponse.json()
      const mensagemMelhorada = data.choices?.[0]?.message?.content?.trim()

      if (!mensagemMelhorada) {
        return NextResponse.json(
          { error: 'Resposta vazia da OpenAI' },
          { status: 502 },
        )
      }

      return NextResponse.json({ mensagem_melhorada: mensagemMelhorada })
    } catch (fetchError: any) {
      clearTimeout(timeout)
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Timeout: a OpenAI não respondeu em 10 segundos' },
          { status: 504 },
        )
      }
      console.error('[IA] Fetch error:', fetchError.message)
      return NextResponse.json(
        { error: `Erro ao chamar OpenAI: ${fetchError.message}` },
        { status: 502 },
      )
    }
  } catch (error: any) {
    console.error('[IA] Route error:', error)
    return NextResponse.json(
      { error: error.message || 'Erro interno' },
      { status: 500 },
    )
  }
}
