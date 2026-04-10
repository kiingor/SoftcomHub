import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { message, history, productSlug } = body

    if (!message) {
      return NextResponse.json({ error: 'Campo obrigatório: message' }, { status: 400 })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      const res = await fetch('https://nexus-theta-blush.vercel.app/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer b58c7f73994bdc7c189ea502224627c1cf119b1fbc64e7faec0d8157d7837eb7',
        },
        body: JSON.stringify({
          message,
          productSlug: productSlug || 'softshop',
          model: 'ft:gpt-4o-mini-2024-07-18:softcom-tecnnologia:nexus-v1:DT5iBKif',
          systemPrompt: 'Responda sempre formatando como mensagem de WhatsApp. Use emojis com moderação. Para negrito use apenas UM asterisco de cada lado: *texto* (NUNCA use **texto**). Use _itálico_ quando necessário e quebre linhas para facilitar a leitura. Nunca escreva textos longos em um único bloco. Quando for passo a passo, use lista numerada com 1️⃣ 2️⃣ 3️⃣, cada passo deve ter um título em negrito com *um asterisco* e uma breve descrição, sempre com uma linha em branco entre os passos. O objetivo é ser claro, organizado e fácil de ler no WhatsApp.',
          history: history || [],
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const data = await res.json()
      if (!res.ok) {
        return NextResponse.json({ error: 'Erro na API Nexus', details: data }, { status: 502 })
      }

      return NextResponse.json(data)
    } catch (fetchError: any) {
      clearTimeout(timeout)
      if (fetchError.name === 'AbortError') {
        return NextResponse.json({ error: 'Timeout: Nexus não respondeu em 30s' }, { status: 504 })
      }
      return NextResponse.json({ error: `Erro ao chamar Nexus: ${fetchError.message}` }, { status: 502 })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
