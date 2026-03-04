import { NextRequest, NextResponse } from 'next/server'

const EVOLUTION_BASE_URL = 'https://whatsapi.mensageria.softcomtecnologia.com'
const EVOLUTION_GLOBAL_KEY =
  'duukhYWkWdrmqcREwVqdNumyokmudpPEUuN4B70YqyQrxL5212IfXWUFYCHfejvTGBw4fc378VGMmUcpF7549ktNWMrnjMF8HBmYxHM9xzhItqPlINrmejamx77FPF8d'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> },
) {
  try {
    const { instanceName } = await params

    const response = await fetch(`${EVOLUTION_BASE_URL}/instance/connect/${instanceName}`, {
      method: 'GET',
      headers: { apikey: EVOLUTION_GLOBAL_KEY },
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[Evolution Connect]', data)
      return NextResponse.json(
        { error: 'Erro ao obter QR Code', details: data },
        { status: response.status },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[Evolution Instance Connect]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
