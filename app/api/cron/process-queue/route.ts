import { NextResponse } from 'next/server'
import { processTicketQueue } from '@/lib/ticket-queue-processor'

export const maxDuration = 60

/**
 * GET /api/cron/process-queue
 *
 * Endpoint invocado pelo Vercel Cron a cada minuto. Processa a fila de tickets
 * pendentes e dispara transmissão (transbordo) para tickets em setores onde todos
 * os atendentes estão offline.
 *
 * Protegido por CRON_SECRET — Vercel injeta automaticamente o header
 * `Authorization: Bearer ${CRON_SECRET}` em invocações de cron.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  console.log('[CronProcessQueue] Iniciando —', new Date().toISOString())

  try {
    const stats = await processTicketQueue()
    const elapsed = Date.now() - startTime
    console.log(
      `[CronProcessQueue] Concluído em ${elapsed}ms — inQueue: ${stats.ticketsInQueue}, assigned: ${stats.ticketsAssigned}`
    )
    return NextResponse.json({ success: true, stats, elapsed_ms: elapsed })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[CronProcessQueue] ERRO após ${elapsed}ms:`, error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown',
        elapsed_ms: elapsed,
      },
      { status: 500 }
    )
  }
}
