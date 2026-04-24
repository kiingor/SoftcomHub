import type { SupabaseClient } from '@supabase/supabase-js'

export interface EvolutionCreds {
  baseUrl: string
  apiKey: string
  instanceName: string
}

export interface DestinatarioInput {
  cliente_id?: string | null
  nome?: string | null
  cnpj?: string | null
  registro?: string | null
  telefone: string
}

export interface ResolvedCliente {
  id: string
  telefone: string
}

export async function getEvolutionCreds(
  supabase: SupabaseClient,
  setorId: string,
): Promise<EvolutionCreds | null> {
  const { data: canal } = await supabase
    .from('setor_canais')
    .select('evolution_base_url, evolution_api_key, instancia')
    .eq('setor_id', setorId)
    .eq('tipo', 'evolution_api')
    .eq('ativo', true)
    .order('criado_em', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!canal?.instancia) return null

  return {
    baseUrl: (canal.evolution_base_url || process.env.EVOLUTION_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: canal.evolution_api_key || process.env.EVOLUTION_GLOBAL_API_KEY || '',
    instanceName: canal.instancia,
  }
}

export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export async function findOrCreateCliente(
  supabase: SupabaseClient,
  input: DestinatarioInput,
): Promise<ResolvedCliente | null> {
  if (input.cliente_id) {
    const { data } = await supabase
      .from('clientes')
      .select('id, telefone')
      .eq('id', input.cliente_id)
      .maybeSingle()
    if (data) return { id: data.id, telefone: data.telefone }
  }

  const telefone = normalizePhone(input.telefone)
  if (!telefone) return null

  const { data: existing } = await supabase
    .from('clientes')
    .select('id, telefone')
    .eq('telefone', telefone)
    .maybeSingle()

  if (existing) return { id: existing.id, telefone: existing.telefone }

  const { data: novo, error } = await supabase
    .from('clientes')
    .insert({
      nome: input.nome || 'Cliente',
      telefone,
      CNPJ: input.cnpj || null,
      Registro: input.registro || null,
    })
    .select('id, telefone')
    .single()

  if (error || !novo) {
    console.error('[disparo-processor] erro ao criar cliente:', error?.message)
    return null
  }

  return { id: novo.id, telefone: novo.telefone }
}

export interface SendEvolutionResult {
  success: boolean
  messageId: string | null
  canonicalPhone: string | null
  error?: string
}

export async function sendEvolutionMessage(
  creds: EvolutionCreds,
  telefone: string,
  mensagem: string,
): Promise<SendEvolutionResult> {
  try {
    const url = `${creds.baseUrl}/message/sendText/${creds.instanceName}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: creds.apiKey,
      },
      body: JSON.stringify({
        number: telefone,
        text: mensagem,
        delay: 1000,
      }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        success: false,
        messageId: null,
        canonicalPhone: null,
        error: typeof data === 'object' ? JSON.stringify(data).slice(0, 300) : 'erro Evolution',
      }
    }

    const messageId = data?.key?.id || data?.message?.key?.id || null
    const remoteJid: string | undefined = data?.key?.remoteJid || data?.message?.key?.remoteJid
    let canonicalPhone: string | null = null
    if (remoteJid && remoteJid.endsWith('@s.whatsapp.net')) {
      canonicalPhone = remoteJid.replace('@s.whatsapp.net', '')
    }

    return { success: true, messageId, canonicalPhone }
  } catch (err) {
    return {
      success: false,
      messageId: null,
      canonicalPhone: null,
      error: err instanceof Error ? err.message : 'erro desconhecido',
    }
  }
}

export interface ProcessDispatchParams {
  supabase: SupabaseClient
  loteId: string
  setorId: string
  colaboradorCriadorId: string | null
  mensagem: string
  destinoTipo: 'subsetor' | 'atendentes'
  subsetorId: string | null
  atendentesIds: string[] | null
  destinatarios: DestinatarioInput[]
  creds: EvolutionCreds
}

export interface ProcessDispatchResult {
  total_enviados: number
  total_falhados: number
  falhas: Array<{ telefone: string; motivo: string }>
}

export async function processarDisparoLote(
  params: ProcessDispatchParams,
): Promise<ProcessDispatchResult> {
  const {
    supabase,
    loteId,
    setorId,
    colaboradorCriadorId,
    mensagem,
    destinoTipo,
    subsetorId,
    atendentesIds,
    destinatarios,
    creds,
  } = params

  let enviados = 0
  let falhados = 0
  const falhas: ProcessDispatchResult['falhas'] = []

  for (let i = 0; i < destinatarios.length; i++) {
    const dest = destinatarios[i]

    const cliente = await findOrCreateCliente(supabase, dest)
    if (!cliente) {
      falhados++
      falhas.push({ telefone: dest.telefone, motivo: 'cliente_invalido' })
      continue
    }

    let colaboradorId: string | null = null
    if (destinoTipo === 'atendentes' && atendentesIds && atendentesIds.length > 0) {
      colaboradorId = atendentesIds[i % atendentesIds.length]
    }

    const ticketData: Record<string, unknown> = {
      cliente_id: cliente.id,
      setor_id: setorId,
      status: 'em_atendimento',
      prioridade: 'normal',
      canal: 'whatsapp',
      is_disparo: true,
      disparo_em: new Date().toISOString(),
      disparo_lote_id: loteId,
    }
    if (colaboradorId) ticketData.colaborador_id = colaboradorId
    if (destinoTipo === 'subsetor' && subsetorId) ticketData.subsetor_id = subsetorId

    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .insert(ticketData)
      .select('id')
      .single()

    if (ticketErr || !ticket) {
      falhados++
      falhas.push({ telefone: cliente.telefone, motivo: 'ticket_error' })
      continue
    }

    const envio = await sendEvolutionMessage(creds, cliente.telefone, mensagem)

    if (envio.canonicalPhone && envio.canonicalPhone !== cliente.telefone) {
      await supabase
        .from('clientes')
        .update({ telefone: envio.canonicalPhone })
        .eq('id', cliente.id)
    }

    if (envio.success) {
      await supabase.from('mensagens').insert({
        ticket_id: ticket.id,
        remetente: 'bot',
        conteudo: mensagem,
        tipo: 'texto',
        phone_number_id: creds.instanceName,
        canal_envio: 'evolutionapi',
        whatsapp_message_id: envio.messageId,
        enviado_em: new Date().toISOString(),
      })

      await supabase.from('disparo_logs').insert({
        setor_id: setorId,
        colaborador_id: colaboradorCriadorId,
        ticket_id: ticket.id,
        cliente_nome: dest.nome || null,
        cliente_telefone: cliente.telefone,
        cliente_cnpj: dest.cnpj || null,
        template_usado: `[Disparo Lote] ${mensagem.slice(0, 60)}${mensagem.length > 60 ? '...' : ''}`,
        status: 'enviado',
        disparo_lote_id: loteId,
      })

      enviados++
    } else {
      await supabase.from('disparo_logs').insert({
        setor_id: setorId,
        colaborador_id: colaboradorCriadorId,
        ticket_id: ticket.id,
        cliente_nome: dest.nome || null,
        cliente_telefone: cliente.telefone,
        cliente_cnpj: dest.cnpj || null,
        template_usado: `[Disparo Lote] ${mensagem.slice(0, 60)}${mensagem.length > 60 ? '...' : ''}`,
        status: 'falhado',
        disparo_lote_id: loteId,
      })

      falhados++
      falhas.push({ telefone: cliente.telefone, motivo: envio.error || 'evolution_error' })
    }

    await supabase
      .from('disparos_lote')
      .update({ total_enviados: enviados, total_falhados: falhados })
      .eq('id', loteId)
  }

  return { total_enviados: enviados, total_falhados: falhados, falhas }
}
