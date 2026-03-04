import { NextRequest, NextResponse } from 'next/server'

const EVOLUTION_BASE_URL = 'https://whatsapi.mensageria.softcomtecnologia.com'
const EVOLUTION_GLOBAL_KEY =
  'duukhYWkWdrmqcREwVqdNumyokmudpPEUuN4B70YqyQrxL5212IfXWUFYCHfejvTGBw4fc378VGMmUcpF7549ktNWMrnjMF8HBmYxHM9xzhItqPlINrmejamx77FPF8d'

/** DELETE — Remove instância da EvolutionAPI */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> },
) {
  try {
    const { instanceName } = await params

    await fetch(`${EVOLUTION_BASE_URL}/instance/delete/${instanceName}`, {
      method: 'DELETE',
      headers: { apikey: EVOLUTION_GLOBAL_KEY },
    })

    // Retorna sucesso independente do resultado (pode não existir)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Evolution Instance Delete]', error)
    return NextResponse.json({ success: true })
  }
}
