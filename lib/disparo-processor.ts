import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeBrazilianPhone } from '@/lib/phone'

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
  return normalizeBrazilianPhone(raw)
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

export type EvolutionRecipientStatus =
  | 'available'
  | 'not_registered'
  | 'invalid_phone'
  | 'unavailable'

export interface EvolutionRecipientCheck {
  status: EvolutionRecipientStatus
  telefone: string | null
}

type EvolutionNumberRecord = {
  exists?: unknown
  number?: unknown
}

function lerNumerosEvolution(data: unknown): EvolutionNumberRecord[] {
  const numbers = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as { numbers?: unknown }).numbers)
      ? (data as { numbers: unknown[] }).numbers
      : []

  return numbers.filter(
    (numero): numero is EvolutionNumberRecord => typeof numero === 'object' && numero !== null,
  )
}

function interpretarNumeroEvolution(
  numero: EvolutionNumberRecord | undefined,
  telefone: string,
): EvolutionRecipientCheck {
  if (!numero || typeof numero.exists !== 'boolean') {
    return { status: 'unavailable', telefone: null }
  }
  if (!numero.exists) return { status: 'not_registered', telefone: null }

  const telefoneCanonico = typeof numero.number === 'string'
    ? normalizePhone(numero.number)
    : ''

  return { status: 'available', telefone: telefoneCanonico || telefone }
}

export function interpretarVerificacaoDestinatarioEvolution(
  data: unknown,
  telefone: string,
): EvolutionRecipientCheck {
  return interpretarVerificacoesDestinatariosEvolution(data, [telefone])[0]
}

export function interpretarVerificacoesDestinatariosEvolution(
  data: unknown,
  telefones: readonly string[],
): EvolutionRecipientCheck[] {
  const telefonesNormalizados = telefones.map(normalizePhone)
  const telefonesValidos = telefonesNormalizados.filter(Boolean)
  if (telefonesValidos.length === 0) {
    return telefonesNormalizados.map(() => ({ status: 'invalid_phone', telefone: null }))
  }

  const numeros = lerNumerosEvolution(data)
  const respostaAlinhada = numeros.length === telefonesValidos.length
  const resultadosPorTelefone = new Map<string, EvolutionNumberRecord>()

  for (const [indice, numero] of numeros.entries()) {
    const telefoneRetornado = typeof numero.number === 'string'
      ? normalizePhone(numero.number)
      : ''

    if (telefoneRetornado) {
      resultadosPorTelefone.set(telefoneRetornado, numero)
    } else if (respostaAlinhada && telefonesValidos[indice]) {
      resultadosPorTelefone.set(telefonesValidos[indice], numero)
    }
  }

  return telefonesNormalizados.map((telefone) => {
    if (!telefone) return { status: 'invalid_phone', telefone: null }
    return interpretarNumeroEvolution(resultadosPorTelefone.get(telefone), telefone)
  })
}

export async function verificarDestinatariosEvolution(
  creds: EvolutionCreds,
  telefones: readonly string[],
): Promise<EvolutionRecipientCheck[]> {
  const telefonesNormalizados = telefones.map(normalizePhone)
  const telefonesValidos = telefonesNormalizados.filter(Boolean)
  if (telefonesValidos.length === 0) {
    return telefonesNormalizados.map(() => ({ status: 'invalid_phone', telefone: null }))
  }

  try {
    const response = await fetch(
      `${creds.baseUrl}/chat/whatsappNumbers/${creds.instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: creds.apiKey,
        },
        body: JSON.stringify({ numbers: telefonesValidos }),
      },
    )
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return telefonesNormalizados.map((telefone) => telefone
        ? { status: 'unavailable', telefone: null }
        : { status: 'invalid_phone', telefone: null })
    }

    return interpretarVerificacoesDestinatariosEvolution(data, telefones)
  } catch {
    return telefonesNormalizados.map((telefone) => telefone
      ? { status: 'unavailable', telefone: null }
      : { status: 'invalid_phone', telefone: null })
  }
}

export async function verificarDestinatarioEvolution(
  creds: EvolutionCreds,
  telefone: string,
): Promise<EvolutionRecipientCheck> {
  return (await verificarDestinatariosEvolution(creds, [telefone]))[0]
}

export interface FailedDispatchLogInput {
  setorId: string
  colaboradorId: string | null
  colaboradorNome: string
  clienteNome: string | null | undefined
  clienteTelefone: string | null | undefined
  clienteCnpj: string | null | undefined
  templateName: string
  loteId?: string | null
}

export async function registrarFalhaDeDisparo(
  supabase: SupabaseClient,
  input: FailedDispatchLogInput,
): Promise<void> {
  const { error } = await supabase.from('disparo_logs').insert({
    setor_id: input.setorId,
    colaborador_id: input.colaboradorId,
    colaborador_nome: input.colaboradorNome,
    ticket_id: null,
    cliente_nome: input.clienteNome || null,
    cliente_telefone: input.clienteTelefone || null,
    cliente_cnpj: input.clienteCnpj || null,
    template_name: input.templateName,
    status: 'falhado',
    ...(input.loteId ? { disparo_lote_id: input.loteId } : {}),
  })

  if (error) {
    console.warn('[disparo-processor] não foi possível registrar a falha do disparo:', error.code)
  }
}

export interface ProcessDispatchParams {
  supabase: SupabaseClient
  loteId: string
  setorId: string
  colaboradorCriadorId: string | null
  colaboradorCriadorNome: string
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

/**
 * Subsetor que o disparo herda de quem o criou.
 *
 * Só devolve quando a escolha é inequívoca — o criador ligado a exatamente um
 * subsetor daquele setor. Com dois ou mais, preencher seria adivinhar o
 * roteamento, mesma linha de `escolherSubsetorPadrao`.
 */
export function escolherSubsetorDoCriador(
  subsetorIds: readonly (string | null | undefined)[],
): string | null {
  const unicos = new Set(subsetorIds.filter((id): id is string => Boolean(id)))
  return unicos.size === 1 ? [...unicos][0] : null
}

/**
 * Sem isto o ticket de disparo nascia sem subsetor sempre que o destino eram
 * atendentes — 11.923 dos 11.931 tickets de disparo até 29/07/2026. Ticket órfão
 * só casa com atendente sem vínculo de subsetor, então ele ficava fora da
 * distribuição normal e dos filtros por subsetor.
 */
export async function buscarSubsetoresDoCriador(
  supabase: SupabaseClient,
  setorId: string,
  colaboradorId: string | null,
): Promise<string[]> {
  if (!colaboradorId) return []

  // O teto é explícito porque é UM colaborador dentro de UM setor — são poucas
  // linhas, 50 sobra. Sem limite, o corte silencioso de 1.000 do PostgREST
  // passaria despercebido se o vínculo algum dia crescer.
  const { data, error } = await supabase
    .from('colaboradores_subsetores')
    .select('subsetor_id, subsetores(ativo)')
    .eq('colaborador_id', colaboradorId)
    .eq('setor_id', setorId)
    .limit(50)

  // Falha aqui não pode derrubar o disparo: sem o vínculo, o ticket segue como
  // era antes, sem subsetor.
  if (error || !data) return []

  return data
    .filter((vinculo: any) => vinculo.subsetores?.ativo !== false)
    .map((vinculo: any) => vinculo.subsetor_id as string)
}

export async function processarDisparoLote(
  params: ProcessDispatchParams,
): Promise<ProcessDispatchResult> {
  const {
    supabase,
    loteId,
    setorId,
    colaboradorCriadorId,
    colaboradorCriadorNome,
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

  // Resolvido uma vez: é o mesmo criador para todos os destinatários do lote.
  const subsetorEscolhido = destinoTipo === 'subsetor' && subsetorId
    ? subsetorId
    : escolherSubsetorDoCriador(
      await buscarSubsetoresDoCriador(supabase, setorId, colaboradorCriadorId),
    )
  const templateName = `[Disparo Lote] ${mensagem.slice(0, 60)}${mensagem.length > 60 ? '...' : ''}`
  const verificacoes = await verificarDestinatariosEvolution(
    creds,
    destinatarios.map((destinatario) => destinatario.telefone),
  )

  for (let i = 0; i < destinatarios.length; i++) {
    const dest = destinatarios[i]

    const verificacao = verificacoes[i] ?? { status: 'unavailable' as const, telefone: null }
    if (verificacao.status !== 'available') {
      await registrarFalhaDeDisparo(supabase, {
        setorId,
        colaboradorId: colaboradorCriadorId,
        colaboradorNome: colaboradorCriadorNome,
        clienteNome: dest.nome,
        clienteTelefone: normalizePhone(dest.telefone),
        clienteCnpj: dest.cnpj,
        templateName,
        loteId,
      })
      falhados++
      falhas.push({
        telefone: dest.telefone,
        motivo: verificacao.status === 'not_registered'
          ? 'whatsapp_nao_encontrado'
          : verificacao.status,
      })
      await supabase
        .from('disparos_lote')
        .update({ total_enviados: enviados, total_falhados: falhados })
        .eq('id', loteId)
      continue
    }

    const cliente = await findOrCreateCliente(supabase, {
      ...dest,
      telefone: verificacao.telefone || dest.telefone,
    })
    if (!cliente) {
      await registrarFalhaDeDisparo(supabase, {
        setorId,
        colaboradorId: colaboradorCriadorId,
        colaboradorNome: colaboradorCriadorNome,
        clienteNome: dest.nome,
        clienteTelefone: verificacao.telefone,
        clienteCnpj: dest.cnpj,
        templateName,
        loteId,
      })
      falhados++
      falhas.push({ telefone: dest.telefone, motivo: 'cliente_invalido' })
      await supabase
        .from('disparos_lote')
        .update({ total_enviados: enviados, total_falhados: falhados })
        .eq('id', loteId)
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
    if (subsetorEscolhido) ticketData.subsetor_id = subsetorEscolhido

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

    const envio = await sendEvolutionMessage(
      creds,
      verificacao.telefone || cliente.telefone,
      mensagem,
    )

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

      const { error: logError } = await supabase.from('disparo_logs').insert({
        setor_id: setorId,
        colaborador_id: colaboradorCriadorId,
        colaborador_nome: colaboradorCriadorNome,
        ticket_id: ticket.id,
        cliente_nome: dest.nome || null,
        cliente_telefone: cliente.telefone,
        cliente_cnpj: dest.cnpj || null,
        template_name: templateName,
        status: 'enviado',
        disparo_lote_id: loteId,
      })
      if (logError) {
        console.warn('[disparo-processor] não foi possível registrar o disparo:', logError.code)
      }

      enviados++
    } else {
      const { error: logError } = await supabase.from('disparo_logs').insert({
        setor_id: setorId,
        colaborador_id: colaboradorCriadorId,
        colaborador_nome: colaboradorCriadorNome,
        ticket_id: ticket.id,
        cliente_nome: dest.nome || null,
        cliente_telefone: cliente.telefone,
        cliente_cnpj: dest.cnpj || null,
        template_name: templateName,
        status: 'falhado',
        disparo_lote_id: loteId,
      })
      if (logError) {
        console.warn('[disparo-processor] não foi possível registrar a falha do disparo:', logError.code)
      }

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
