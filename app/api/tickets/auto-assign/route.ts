import { NextResponse } from 'next/server'
import {
  processTicketQueue,
  onColaboradorOnline,
  getQueueConfig,
  updateQueueConfig,
} from '@/lib/ticket-queue-processor'

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
  try {
    const body = await request.json().catch(() => ({}))
    const { colaboradorId } = body

    let stats

    if (colaboradorId) {
      // Colaborador ficou online - processar fila para seus setores
      stats = await onColaboradorOnline(colaboradorId)
    } else {
      // Processamento geral da fila
      stats = await processTicketQueue()
    }

    return NextResponse.json({
      success: true,
      message: `Processados ${stats.ticketsInQueue} tickets, ${stats.ticketsAssigned} atribuidos`,
      stats,
    })
  } catch (error) {
    console.error('Error processing ticket queue:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
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
