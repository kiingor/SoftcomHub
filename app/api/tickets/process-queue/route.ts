import { NextResponse } from 'next/server'
import { onColaboradorOnline } from '@/lib/ticket-queue-processor'

/**
 * POST /api/tickets/process-queue
 * 
 * Processa a fila de tickets quando um colaborador fica online.
 * Distribui tickets em espera para colaboradores disponíveis.
 * 
 * Body: { colaboradorId: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { colaboradorId } = body

    if (!colaboradorId) {
      return NextResponse.json({ error: 'colaboradorId required' }, { status: 400 })
    }

    console.log(`[v0] Processing queue for colaborador ${colaboradorId} coming online`)

    // Process the queue for this colaborador's setores
    const stats = await onColaboradorOnline(colaboradorId)

    console.log(`[v0] Queue processed: ${stats.ticketsAssigned} tickets assigned, ${stats.ticketsInQueue} in queue`)

    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error) {
    console.error('[v0] Error processing queue:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
