import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveNexusDashboardAccess } from '@/lib/server/nexus-dashboard-access'
import { resolveNexusChannelConfiguration } from '@/lib/server/nexus-monitoring-query'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
}

const querySchema = z.object({
  setorIds: z.array(z.string().uuid()).min(1).max(200),
})

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS })
}

export async function GET(request: NextRequest) {
  try {
    const setorIds = [...new Set(
      request.nextUrl.searchParams
        .getAll('setorIds')
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean),
    )]
    const parsedQuery = querySchema.safeParse({ setorIds })
    if (!parsedQuery.success) {
      return privateJson({ error: 'Setores inválidos' }, 400)
    }

    const authClient = await createServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user?.email) {
      return privateJson({ error: 'Não autenticado' }, 401)
    }

    const supabase = createServiceClient()
    const access = await resolveNexusDashboardAccess(supabase, user.email)
    if (!access) return privateJson({ error: 'Acesso negado' }, 403)

    const authorizedSectorIds = new Set(access.sectorIds)
    if (parsedQuery.data.setorIds.some((sectorId) => !authorizedSectorIds.has(sectorId))) {
      return privateJson({ error: 'Setor não autorizado' }, 403)
    }

    return privateJson(await resolveNexusChannelConfiguration(
      supabase,
      parsedQuery.data.setorIds,
    ))
  } catch (error) {
    console.error('[nexus/canais] Erro inesperado:', error)
    return privateJson({ error: 'Erro ao resolver canais do Nexus' }, 500)
  }
}
