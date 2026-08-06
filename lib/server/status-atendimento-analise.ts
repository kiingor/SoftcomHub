import 'server-only'

import { createHash } from 'node:crypto'

import type { createServiceClient } from '@/lib/supabase/service'

export const INTERVALO_GERACAO_STATUS_ATENDIMENTO_SEGUNDOS = 30

export interface MetadadosPromptStatusAtendimento {
  ticket: {
    id: string
    numero: number | string | null
    status: string | null
    aberto_em: string | null
  }
  cliente_id: string | null
  cliente: string | null
  atendente_id: string | null
  atendente: string | null
  modelo: string
  versao: string
}

type ClienteDeServico = ReturnType<typeof createServiceClient>

export type ResultadoReservaGeracao =
  | { ok: true; permitida: true }
  | {
    ok: true
    permitida: false
    retryAfterSeconds: number
    proximaGeracaoEm: string | null
  }
  | { ok: false; erro: string }

/**
 * Inclui exatamente o prompt e a entrada enviados ao provedor, mais os campos
 * que explicam como a entrada foi montada. Assim, uma transcrição atualizada
 * no mesmo id da mensagem não reutiliza uma análise antiga.
 */
export function assinarConteudoAnalisado({
  prompt,
  entrada,
  transcricao,
  metadados,
}: {
  prompt: string
  entrada: string
  transcricao: string
  metadados: MetadadosPromptStatusAtendimento
}): string {
  const conteudo = JSON.stringify({
    prompt,
    entrada,
    transcricao,
    metadados: {
      ticket: {
        id: metadados.ticket.id,
        numero: metadados.ticket.numero,
        status: metadados.ticket.status,
        aberto_em: metadados.ticket.aberto_em,
      },
      cliente_id: metadados.cliente_id,
      cliente: metadados.cliente,
      atendente_id: metadados.atendente_id,
      atendente: metadados.atendente,
      modelo: metadados.modelo,
      versao: metadados.versao,
    },
  })

  return createHash('sha256').update(conteudo, 'utf8').digest('hex')
}

function segundosAte(proximaGeracaoEm: string | null, agoraMs: number): number {
  const proximaMs = proximaGeracaoEm ? Date.parse(proximaGeracaoEm) : Number.NaN
  if (!Number.isFinite(proximaMs)) return INTERVALO_GERACAO_STATUS_ATENDIMENTO_SEGUNDOS

  return Math.max(1, Math.ceil((proximaMs - agoraMs) / 1000))
}

/** Converte a resposta da RPC no contrato que a rota consegue expor com segurança. */
export function interpretarReservaGeracao(
  dados: unknown,
  agoraMs = Date.now(),
): ResultadoReservaGeracao {
  const linha = Array.isArray(dados) ? dados[0] : dados
  if (!linha || typeof linha !== 'object') {
    return { ok: false, erro: 'A reserva de geração retornou um formato inválido.' }
  }

  const resultado = linha as { permitida?: unknown; proxima_geracao_em?: unknown }
  if (resultado.permitida === true) return { ok: true, permitida: true }
  if (resultado.permitida !== false) {
    return { ok: false, erro: 'A reserva de geração não informou se foi permitida.' }
  }

  const proximaGeracaoEm = typeof resultado.proxima_geracao_em === 'string'
    ? resultado.proxima_geracao_em
    : null

  return {
    ok: true,
    permitida: false,
    retryAfterSeconds: segundosAte(proximaGeracaoEm, agoraMs),
    proximaGeracaoEm,
  }
}

/**
 * Reserva uma chamada de LLM no banco antes de iniciá-la. A RPC usa lock de
 * linha, portanto duas instâncias não conseguem reservar o mesmo ticket.
 */
export async function reservarGeracaoStatusAtendimento(
  db: ClienteDeServico,
  ticketId: string,
): Promise<ResultadoReservaGeracao> {
  const { data, error } = await db.rpc('reservar_geracao_status_atendimento', {
    p_ticket_id: ticketId,
    p_intervalo_segundos: INTERVALO_GERACAO_STATUS_ATENDIMENTO_SEGUNDOS,
  })

  if (error) return { ok: false, erro: error.message }
  return interpretarReservaGeracao(data)
}
