// Chamada de rede da checagem de OC — caso #97240.
//
// Só o fetch mora aqui; quem decide qualquer coisa é `@/lib/oc-ticket`, que é
// puro e testado. Este arquivo importa por `@/`, então não roda sob
// `node --test` — e é justamente por isso que ele não decide nada.
//
// Mesmo padrão de `softcom-client.ts`: base em `SOFTCOM_API_URL`, autenticação
// pelo header `x-api-key` a partir de `SOFTCOM_API_KEY`. Nenhum cliente novo.

import { interpretarRespostaOc, ocIndeterminada, type ConsultaOc } from '@/lib/oc-ticket'

/**
 * Curto de propósito: isso roda no caminho de encerrar ticket, que o atendente
 * percorre o dia inteiro. Estourar o prazo cai em `indeterminado`, que LIBERA.
 * Sem retry — insistir só empurraria a espera do atendente para o dobro.
 */
const OC_LOOKUP_TIMEOUT_MS = 4_000
const MAX_OC_RESPONSE_BYTES = 128 * 1024

export async function consultarOcDoTicket(numero: number | string): Promise<ConsultaOc> {
  const apiKey = process.env.SOFTCOM_API_KEY
  if (!apiKey) return ocIndeterminada('SOFTCOM_API_KEY não está configurada')

  const numeroNormalizado = String(numero).trim()
  if (!/^\d+$/.test(numeroNormalizado)) {
    return ocIndeterminada(`número de ticket inesperado: ${numeroNormalizado || '(vazio)'}`)
  }

  const baseUrl = (process.env.SOFTCOM_API_URL || 'https://api.softcom.cloud/v1').replace(/\/$/, '')

  try {
    const resposta = await fetch(`${baseUrl}/tickets/numero/${numeroNormalizado}`, {
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(OC_LOOKUP_TIMEOUT_MS),
    })

    const corpo = await resposta.text()
    if (corpo.length > MAX_OC_RESPONSE_BYTES) {
      return ocIndeterminada(`a API respondeu ${resposta.status} com um corpo grande demais`)
    }

    return interpretarRespostaOc(resposta.status, corpo)
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'erro desconhecido'
    return ocIndeterminada(`a consulta de OC falhou: ${mensagem}`)
  }
}
