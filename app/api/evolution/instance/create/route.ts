import { NextRequest, NextResponse } from 'next/server'

const EVOLUTION_BASE_URL = 'https://whatsapi.mensageria.softcomtecnologia.com'
const EVOLUTION_GLOBAL_KEY =
  'duukhYWkWdrmqcREwVqdNumyokmudpPEUuN4B70YqyQrxL5212IfXWUFYCHfejvTGBw4fc378VGMmUcpF7549ktNWMrnjMF8HBmYxHM9xzhItqPlINrmejamx77FPF8d'

export async function POST(request: NextRequest) {
  try {
    const { instanceName } = await request.json()
    if (!instanceName) {
      return NextResponse.json({ error: 'instanceName é obrigatório' }, { status: 400 })
    }

    const response = await fetch(`${EVOLUTION_BASE_URL}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_GLOBAL_KEY,
      },
      body: JSON.stringify({
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        groupsIgnore: true,
        webhook: {
          url: 'https://n8n-webhook.mensageria.softcomtecnologia.com/webhook/evolution',
          byEvents: false,
          base64: false,
          events: ['MESSAGES_UPSERT'],
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[Evolution Create]', data)
      return NextResponse.json(
        { error: 'Erro ao criar instância', details: data },
        { status: response.status },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[Evolution Instance Create]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
