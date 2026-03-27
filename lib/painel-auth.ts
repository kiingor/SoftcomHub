import { NextRequest, NextResponse } from 'next/server'

const PAINEL_USER = 'api_hub_prod'
const PAINEL_PASS = 'S0ftc0m@API#9Xv72!Lp'

/**
 * Valida Basic Auth para os endpoints /api/painel/*.
 * Retorna null se autenticado, ou NextResponse 401 se não.
 */
export function validatePainelAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return NextResponse.json(
      { error: 'Authentication required' },
      {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Painel API"' },
      },
    )
  }

  try {
    const base64 = authHeader.slice(6)
    const decoded = atob(base64)
    const [user, pass] = decoded.split(':')

    if (user === PAINEL_USER && pass === PAINEL_PASS) {
      return null // autenticado
    }
  } catch {
    // base64 inválido
  }

  return NextResponse.json(
    { error: 'Invalid credentials' },
    {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Painel API"' },
    },
  )
}
