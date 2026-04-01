import { NextResponse } from 'next/server'
import {
  processTicketQueue,
  onColaboradorOnline,
  getQueueConfig,
  updateQueueConfig,
} from '@/lib/ticket-queue-processor'

// Aumenta o limite de timeout da Serverless Function (Vercel Pro/Enterprise)
// No plano Hobby o limite permanece 10s independente deste valor
export const maxDuration = 60

/**
 * POST /api/tickets/auto-assign
 *
 * Processa a fila de tickets e distribui automaticamente para colaboradores online.
 * Inclui protecao contra concorrencia e logging para auditoria.
 *
 * Body params:
 * - colaboradorId: (optional) Se fornecido, processa quando colaborador fica online
 */
export async function POST(request: Request) {
  const startTime = Date.now()
  console.log('[AutoAssign] Iniciando processamento —', new Date().toISOString())

  try {
    const body = await request.json().catch(() => ({}))
    const { colaboradorId } = body

    let stats

    if (colaboradorId) {
      // Colaborador ficou online - processar fila para seus setores
      console.log('[AutoAssign] Modo: colaborador online — id:', colaboradorId)
      stats = await onColaboradorOnline(colaboradorId)
    } else {
      // Processamento geral da fila
      console.log('[AutoAssign] Modo: processamento geral da fila')
      stats = await processTicketQueue()
    }

    const elapsed = Date.now() - startTime
    console.log(
      `[AutoAssign] Concluído em ${elapsed}ms — inQueue: ${stats.ticketsInQueue}, assigned: ${stats.ticketsAssigned}`
    )

    return NextResponse.json({
      success: true,
      message: `Processados ${stats.ticketsInQueue} tickets, ${stats.ticketsAssigned} atribuidos`,
      stats,
      elapsed_ms: elapsed,
    })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[AutoAssign] ERRO após ${elapsed}ms:`, error)
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

/**
 * GET /api/tickets/auto-assign
 * 
 * Retorna a configuracao atual do processador de fila
 */
export async function GET() {
  try {
    const config = await getQueueConfig()
    return NextResponse.json({ config })
  } catch (error) {
    console.error('Error getting queue config:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/tickets/auto-assign
 * 
 * Atualiza a configuracao do processador de fila
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    
    await updateQueueConfig({
      checkIntervalMs: body.checkIntervalMs,
      maxQueueTimeMinutes: body.maxQueueTimeMinutes,
      enabled: body.enabled,
    })

    const config = await getQueueConfig()
    return NextResponse.json({ 
      success: true, 
      message: 'Configuration updated',
      config 
    })
  } catch (error) {
    console.error('Error updating queue config:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
