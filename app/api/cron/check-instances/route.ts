import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendPushToColaboradores } from '@/lib/push'

export const maxDuration = 60

const EVOLUTION_BASE_URL = 'https://whatsapi.mensageria.softcomtecnologia.com'
const EVOLUTION_GLOBAL_KEY =
  'duukhYWkWdrmqcREwVqdNumyokmudpPEUuN4B70YqyQrxL5212IfXWUFYCHfejvTGBw4fc378VGMmUcpF7549ktNWMrnjMF8HBmYxHM9xzhItqPlINrmejamx77FPF8d'

async function getConnectionState(instanceName: string): Promise<string> {
  try {
    const res = await fetch(
      `${EVOLUTION_BASE_URL}/instance/connectionState/${instanceName}`,
      { method: 'GET', headers: { apikey: EVOLUTION_GLOBAL_KEY } },
    )
    if (res.status === 404) return 'not_found'
    if (!res.ok) return 'unknown'
    const data = await res.json()
    return data?.instance?.state || 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Masters + supervisores (permissão com can_view_dashboard) — quem reconecta instâncias. */
async function getSupervisorIds(
  service: ReturnType<typeof createServiceClient>,
): Promise<string[]> {
  const ids = new Set<string>()

  const { data: masters } = await service
    .from('colaboradores')
    .select('id')
    .eq('is_master', true)
  ;(masters || []).forEach((m: { id: string }) => ids.add(m.id))

  const { data: perms } = await service
    .from('permissoes')
    .select('id')
    .eq('can_view_dashboard', true)
  const permIds = (perms || []).map((p: { id: string }) => p.id)

  if (permIds.length > 0) {
    const { data: supers } = await service
      .from('colaboradores')
      .select('id')
      .in('permissao_id', permIds)
    ;(supers || []).forEach((s: { id: string }) => ids.add(s.id))
  }

  return Array.from(ids)
}

/**
 * GET /api/cron/check-instances
 *
 * Cron: checa o estado de conexão de cada instância Evolution e, ao detectar
 * a transição conectado -> desconectado, dispara web push aos masters/supervisores.
 * Protegido por CRON_SECRET (Bearer). Só alerta quando o estado ANTERIOR era
 * 'open' — evita alarme falso na primeira execução ou em instância nunca conectada.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const nowIso = new Date().toISOString()

  try {
    const { data: canais, error: canaisErr } = await service
      .from('setor_canais')
      .select('id, setor_id, instancia, last_connection_state')
      .eq('tipo', 'evolution_api')
      .eq('ativo', true)
      .not('instancia', 'is', null)

    if (canaisErr) {
      console.error('[cron/check-instances] erro ao listar canais:', canaisErr)
      return NextResponse.json(
        { error: 'DB error', details: canaisErr.message, hint: canaisErr.hint ?? null },
        { status: 500 },
      )
    }

    if (!canais || canais.length === 0) {
      return NextResponse.json({ success: true, checked: 0, disconnected: 0 })
    }

    // Nomes dos setores (query separada pra evitar ambiguidade de FK no embed)
    const setorIds = Array.from(
      new Set(canais.map((c: { setor_id: string | null }) => c.setor_id).filter(Boolean)),
    ) as string[]
    const setorNomes = new Map<string, string>()
    if (setorIds.length > 0) {
      const { data: setores } = await service
        .from('setores')
        .select('id, nome')
        .in('id', setorIds)
      ;(setores || []).forEach((s: { id: string; nome: string }) =>
        setorNomes.set(s.id, s.nome),
      )
    }

    let recipientIds: string[] | null = null
    let disconnected = 0

    for (const canal of canais as Array<{
      id: string
      setor_id: string | null
      instancia: string
      last_connection_state: string | null
    }>) {
      const state = await getConnectionState(canal.instancia)
      const prev = canal.last_connection_state

      // Persiste mudança de estado
      if (state !== prev) {
        await service
          .from('setor_canais')
          .update({ last_connection_state: state, last_state_changed_at: nowIso })
          .eq('id', canal.id)
      }

      const isDown = state === 'close' || state === 'not_found'
      if (isDown && prev === 'open') {
        disconnected++
        const setorNome = (canal.setor_id && setorNomes.get(canal.setor_id)) || 'Setor'

        // Carrega destinatários sob demanda (só quando há ao menos 1 queda)
        if (recipientIds === null) recipientIds = await getSupervisorIds(service)

        await sendPushToColaboradores(service, recipientIds, {
          title: '⚠️ WhatsApp desconectado',
          body: `O setor "${setorNome}" parou de receber mensagens. Toque para reconectar o QR Code.`,
          url: canal.setor_id ? `/setor/${canal.setor_id}` : '/dashboard',
          tag: `instancia-${canal.id}`,
          type: 'instancia',
        })
      }
    }

    return NextResponse.json({ success: true, checked: canais.length, disconnected })
  } catch (error) {
    console.error('[cron/check-instances]', error)
    return NextResponse.json(
      { error: 'Internal error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    )
  }
}
