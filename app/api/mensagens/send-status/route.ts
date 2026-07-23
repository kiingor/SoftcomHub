import { NextResponse } from 'next/server'
import { z } from 'zod'
import { reconcilePendingMessageSend } from '@/lib/message-send-claim'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { authorizeTicketSend } from '@/lib/ticket-send-auth'

const requestSchema = z.object({
  ticketId: z.string().uuid(),
  messageId: z.string().uuid(),
  action: z.literal('mark_indeterminate'),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Parâmetros inválidos', code: 'INVALID_SEND_STATUS_REQUEST' },
      { status: 400 },
    )
  }

  const { ticketId, messageId } = parsed.data
  const authorization = await authorizeTicketSend(supabase, ticketId, user.email)
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error, code: authorization.code },
      { status: authorization.status },
    )
  }

  const result = await reconcilePendingMessageSend(
    createServiceClient(),
    ticketId,
    messageId,
  )

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        status_envio: result.status_envio,
      },
      { status: result.status },
    )
  }

  return NextResponse.json({
    success: true,
    changed: result.changed,
    status_envio: result.status_envio,
  })
}
