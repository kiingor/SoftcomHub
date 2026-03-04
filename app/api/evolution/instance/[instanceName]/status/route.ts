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

    const response = await fetch(
      `${EVOLUTION_BASE_URL}/instance/connectionState/${instanceName}`,
      {
        method: 'GET',
        headers: { apikey: EVOLUTION_GLOBAL_KEY },
      },
    )

    if (response.status === 404) {
      return NextResponse.json({ instance: { state: 'not_found' } })
    }

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json({ instance: { state: 'unknown' } })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[Evolution Instance Status]', error)
    return NextResponse.json({ instance: { state: 'unknown' } })
  }
}
