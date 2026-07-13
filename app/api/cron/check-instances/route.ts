import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendPushToColaboradores } from '@/lib/push'

export const maxDuration = 60

const EVOLUTION_BASE_URL =
  process.env.EVOLUTION_BASE_URL || 'https://whatsapi.mensageria.softcomtecnologia.com'
const EVOLUTION_GLOBAL_KEY = process.env.EVOLUTION_GLOBAL_API_KEY

async function getConnectionState(
  instanceName: string,
  configuredBaseUrl: string | null,
  configuredApiKey: string | null,
): Promise<string> {
  const apiKey = configuredApiKey || EVOLUTION_GLOBAL_KEY
  if (!apiKey) return 'unknown'
  const baseUrl = (configuredBaseUrl || EVOLUTION_BASE_URL).replace(/\/$/, '')
  try {
    const res = await fetch(
      `${baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
      { method: 'GET', headers: { apikey: apiKey } },
    )
    if (res.status === 404) return 'not_found'
    if (!res.ok) return 'unknown'
    const data = await res.json()
    return data?.instance?.state || 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Masters/supervisores ativos vinculados ao setor no acesso do Dashboard. */
async function getSupervisorIdsForSetor(
  service: ReturnType<typeof createServiceClient>,
  setorId: string,
): Promise<string[]> {
  const { data: links, error: linksError } = await service
    .from('colaborador_setores')
    .select('colaborador_id')
    .eq('setor_id', setorId)
  if (linksError) throw linksError

  const linkedIds = Array.from(
    new Set((links || []).map((link: { colaborador_id: string }) => link.colaborador_id)),
  )
  if (linkedIds.length === 0) return []

  const { data: perms, error: permissionsError } = await service
    .from('permissoes')
    .select('id')
    .eq('can_view_dashboard', true)
  if (permissionsError) throw permissionsError
  const permIds = (perms || []).map((permission: { id: string }) => permission.id)

  const { data: colaboradores, error: colaboradoresError } = await service
    .from('colaboradores')
    .select('id, is_master, permissao_id')
    .in('id', linkedIds)
    .eq('ativo', true)
  if (colaboradoresError) throw colaboradoresError

  return (colaboradores || [])
    .filter(
      (colaborador: { is_master: boolean | null; permissao_id: string | null }) =>
        colaborador.is_master ||
        (colaborador.permissao_id !== null && permIds.includes(colaborador.permissao_id)),
    )
    .map((colaborador: { id: string }) => colaborador.id)
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
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const service = createServiceClient()
  const nowIso = new Date().toISOString()

  try {
    const { data: canais, error: canaisErr } = await service
      .from('setor_canais')
      .select(
        'id, setor_id, instancia, evolution_base_url, evolution_api_key, last_connection_state',
      )
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

    const recipientsBySetor = new Map<string, string[]>()
    let disconnected = 0

    for (const canal of canais as Array<{
      id: string
      setor_id: string | null
      instancia: string
      evolution_base_url: string | null
      evolution_api_key: string | null
      last_connection_state: string | null
    }>) {
      const state = await getConnectionState(
        canal.instancia,
        canal.evolution_base_url,
        canal.evolution_api_key,
      )
      const prev = canal.last_connection_state

      // Falha de rede não deve apagar a última informação confiável de conexão.
      if (state === 'unknown') continue

      const isDown = state === 'close' || state === 'not_found'
      if (isDown && prev === 'open') {
        disconnected++
        const setorNome = (canal.setor_id && setorNomes.get(canal.setor_id)) || 'Setor'

        // Carrega destinatários sob demanda (só quando há ao menos 1 queda)
        const setorId = canal.setor_id
        let recipientIds: string[] = []
        if (setorId) {
          const cachedRecipients = recipientsBySetor.get(setorId)
          recipientIds = cachedRecipients || (await getSupervisorIdsForSetor(service, setorId))
          if (!cachedRecipients) recipientsBySetor.set(setorId, recipientIds)
        }

        try {
          const delivery = await sendPushToColaboradores(service, recipientIds, {
            title: '⚠️ WhatsApp desconectado',
            body: `O setor "${setorNome}" parou de receber mensagens. Toque para reconectar o QR Code.`,
            url: canal.setor_id ? `/setor/${canal.setor_id}` : '/dashboard',
            tag: `instancia-${canal.id}`,
            type: 'instancia',
          })

          // Se há gestores vinculados mas nenhum dispositivo recebeu, mantém o
          // estado anterior para tentar novamente no próximo cron.
          if (recipientIds.length > 0 && delivery.sent === 0) continue
        } catch (error) {
          console.error(`[cron/check-instances] falha no push do canal ${canal.id}:`, error)
          continue
        }
      }

      if (state !== prev) {
        const { error: updateError } = await service
          .from('setor_canais')
          .update({ last_connection_state: state, last_state_changed_at: nowIso })
          .eq('id', canal.id)
        if (updateError) {
          console.error(`[cron/check-instances] falha ao persistir canal ${canal.id}:`, updateError)
        }
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
