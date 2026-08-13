// Chamada de rede da checagem de OC — caso #97240.
//
// Só o fetch mora aqui; quem decide qualquer coisa é `@/lib/oc-ticket`, que é
// puro e testado. Este arquivo importa por `@/`, então não roda sob
// `node --test` — e é justamente por isso que ele não decide nada.
//
// Mesmo padrão de `softcom-client.ts`: base em `SOFTCOM_API_URL`, autenticação
// pelo header `x-api-key` a partir de `SOFTCOM_API_KEY`. Nenhum cliente novo.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ ATENÇÃO — A CONSULTA ABAIXO ESTÁ PROVISÓRIA E COMPROVADAMENTE ERRADA.    │
// │ NÃO LIGUE `OC_OBRIGATORIA_PARA_ENCERRAR` ANTES DE CORRIGI-LA.            │
// └──────────────────────────────────────────────────────────────────────────┘
//
// `GET /v1/tickets/numero/{numero}` NÃO filtra pelo número do ticket do Hub.
// Medido em 13/08/2026, com a chave de produção:
//
//   162469  (Hub: SOFTCOM BACKUP)      -> array[0]  (vazio)
//   164347  (Hub: DEUS NO COMANDO)     -> array[1]  MBCA DISTRIBUIDORA  ← outro cliente
//   164371  (Hub: criado 1h antes)     -> array[0]  (vazio)
//   999999999 (número inventado)       -> array[2]  ASTGRAFICA TERESINA ← não existe no Hub
//
// Um número inventado devolve OCs reais, e um ticket real devolve a OC de outro
// cliente. Ou seja: o parâmetro é interpretado de outra forma, ou ignorado.
//
// Com a flag LIGADA e esta consulta, `array[0]` vira "o atendente não abriu a
// OC" e o ticket fica IMPOSSÍVEL de encerrar — três dos quatro casos acima
// travariam sem que nenhuma OC pudesse liberá-los.
//
// O que falta descobrir: por qual campo a OC guarda o número do ticket do Hub.
// O WorkDesk já manda `?ticket={numero}` ao abrir a ocorrência rápida
// (`buildOcorrenciaRapidaUrl`), então o número CHEGA na agenda — falta o
// caminho de volta.
//
// Quando souber: só a URL/parâmetro deste arquivo mudam (e o formato em
// `interpretarRespostaOc`, se for diferente). Decisão, flag, fail-open, trava de
// tela e testes aproveitam inteiros.

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
