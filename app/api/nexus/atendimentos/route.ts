import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveNexusDashboardAccess } from '@/lib/server/nexus-dashboard-access'
import {
  NexusHistoryBoundaryLimitError,
  NexusHistoryBusyError,
  NexusHistoryScanLimitError,
  queryNexusAttendances,
  type NexusHistorySituation,
} from '@/lib/server/nexus-monitoring-query'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
}

const REQUEST_WINDOW_MS = 30_000
const REQUEST_LIMIT = 30
const requestWindows = new Map<string, { count: number; startedAt: number }>()

const situationSchema = z.enum(['encerrada_sem_ticket', 'em_conversa', 'finalizado'])

const querySchema = z.object({
  range: z.enum(['hoje', '24h', '7d']).default('hoje'),
  timezoneOffset: z.coerce.number().int().min(-840).max(840).default(180),
  page: z.coerce.number().int().min(0).max(100_000).default(0),
  q: z.string().trim().max(200).default(''),
  situations: z.array(situationSchema).max(3).default([]),
  setorIds: z.array(z.string().uuid()).max(200).default([]),
})

function privateJson(body: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { ...PRIVATE_HEADERS, ...headers },
  })
}

function consumeRequestQuota(userId: string) {
  const now = Date.now()
  if (requestWindows.size >= 1000) {
    for (const [key, window] of requestWindows) {
      if (now - window.startedAt >= REQUEST_WINDOW_MS) requestWindows.delete(key)
    }
  }
  const current = requestWindows.get(userId)

  if (!current || now - current.startedAt >= REQUEST_WINDOW_MS) {
    requestWindows.set(userId, { count: 1, startedAt: now })
    return true
  }

  if (current.count >= REQUEST_LIMIT) return false
  current.count += 1
  return true
}

function parseList(searchParams: URLSearchParams, key: string) {
  return [...new Set(
    searchParams
      .getAll(key)
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean),
  )]
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const parsedQuery = querySchema.safeParse({
      range: searchParams.get('range') || undefined,
      timezoneOffset: searchParams.get('timezoneOffset') || undefined,
      page: searchParams.get('page') || undefined,
      q: searchParams.get('q') || undefined,
      situations: parseList(searchParams, 'situations'),
      setorIds: parseList(searchParams, 'setorIds'),
    })

    if (!parsedQuery.success) {
      return privateJson({
        error: 'Parâmetros inválidos',
        details: parsedQuery.error.issues[0]?.message,
      }, 400)
    }

    const authClient = await createServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user?.email) {
      return privateJson({ error: 'Não autenticado' }, 401)
    }
    if (!consumeRequestQuota(user.id)) {
      return privateJson(
        { error: 'Muitas consultas em pouco tempo. Aguarde alguns segundos.' },
        429,
        { 'Retry-After': String(REQUEST_WINDOW_MS / 1000) },
      )
    }

    const supabase = createServiceClient()
    const access = await resolveNexusDashboardAccess(supabase, user.email)
    if (!access) {
      return privateJson({ error: 'Acesso negado' }, 403)
    }

    const authorizedSectorIds = access.sectorIds
    const authorizedSectorSet = new Set(authorizedSectorIds)
    const requestedSectorIds = parsedQuery.data.setorIds

    if (requestedSectorIds.some((sectorId) => !authorizedSectorSet.has(sectorId))) {
      return privateJson({ error: 'Setor não autorizado' }, 403)
    }

    const sectorIds = requestedSectorIds.length > 0
      ? requestedSectorIds
      : authorizedSectorIds
    const result = await queryNexusAttendances({
      supabase,
      userId: user.id,
      sectorIds,
      range: parsedQuery.data.range,
      timezoneOffset: parsedQuery.data.timezoneOffset,
      page: parsedQuery.data.page,
      q: parsedQuery.data.q,
      situations: parsedQuery.data.situations as NexusHistorySituation[],
    })

    return privateJson(result)
  } catch (error) {
    if (error instanceof NexusHistoryBusyError) {
      return privateJson({
        error: 'A monitoria está processando outras consultas. Tente novamente em alguns segundos.',
        code: error.code,
      }, 503, { 'Retry-After': '5' })
    }

    if (error instanceof NexusHistoryBoundaryLimitError) {
      return privateJson({
        error: 'Existe uma sessão Nexus contínua há mais de 31 dias. Refine a configuração antes de consultar.',
        code: error.code,
      }, 422)
    }

    if (error instanceof NexusHistoryScanLimitError) {
      return privateJson({
        error: 'Histórico amplo demais para consulta',
        code: error.code,
        limit: error.limit,
      }, 422)
    }

    console.error('[nexus/atendimentos] Erro inesperado:', error)
    return privateJson({ error: 'Erro ao carregar histórico do Nexus' }, 500)
  }
}
