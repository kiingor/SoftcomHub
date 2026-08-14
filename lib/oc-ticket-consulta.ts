// Chamada de rede da checagem de OC — caso #97240.
//
// Só o fetch mora aqui; quem decide qualquer coisa é `@/lib/oc-ticket`, que é
// puro e testado. Este arquivo importa por `@/`, então não roda sob
// `node --test` — e é justamente por isso que ele não decide nada.
//
// Mesmo padrão de `softcom-client.ts`: base em `SOFTCOM_API_URL`, autenticação
// pelo header `x-api-key` a partir de `SOFTCOM_API_KEY`. Nenhum cliente novo.
//
// COMO O VÍNCULO OC <-> TICKET DO HUB FUNCIONA
//
// Ida: o WorkDesk abre a ocorrência rápida com `?ticket={numero}`
// (`buildOcorrenciaRapidaUrl`, em `app/workdesk/page.tsx`). O formulário da
// agenda grava esse número num campo próprio da OC, chamado `ticket`.
//
// Volta: `GET /v1/tickets/numero/{numero}` filtra por esse campo `ticket` e
// devolve uma LISTA — as OCs daquele número, `[]` quando não há nenhuma. É
// exatamente a pergunta do caso #97240: "existe OC para o ticket N?".
//
// Formato de cada item (campos que importam aqui):
//   { id: 10790936, ticket: 164494, clienteId, clienteNome, motivo, data,
//     status: "aberto" | "finalizado", ... }
// `id` é a OC; `ticket` é o número do Hub. São números diferentes.
//
// Medido em 13/08/2026 contra produção, cruzando com o banco do Hub:
//
//   164494 -> [1] OC 10790936, tel 8391995920  = Hub tel 558391995920   ✓ mesma linha
//   125153 -> [1] OC 10349271, "ACTION BIKE - TEOFILO OTONI"            ✓ mesmo cliente
//   164347 -> [1] OC 10790323, tel 81982687857 = Hub tel 558182687857   ✓ mesma linha
//   162469, 164371, 164372, 164288, 164523 (+5)  -> []                  ✓ sem OC mesmo
//
// Os dois "contra-exemplos" que antes pareciam provar que o filtro era ignorado
// eram leitura errada, não bug:
//
//   - `clienteNome` divergente: o Hub guarda o nome de PERFIL do WhatsApp
//     ("DEUS NO COMANDO 🙏", "nadyakelly2017") e a agenda guarda a razão social
//     ("MBCA DISTRIBUIDORA...", "NEM BIKE CG"). Conferido pelo CNPJ em
//     `/v1/clientes`: é o mesmo cliente, e o telefone bate (só muda o nono
//     dígito).
//   - `999999999` devolver OCs reais: `999999999` está gravado no campo
//     `ticket` de OCs de 2025, anteriores a este link. É lixo digitado, não
//     prova de filtro ignorado. `tickets.numero` do Hub é SERIAL (~164 mil),
//     então não colide.
//
// Por causa desse lixo, `interpretarRespostaOc` confere o `ticket` de cada OC
// devolvida contra o número consultado — divergência vira "não consegui
// verificar" (libera), nunca um veredito.

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

    return interpretarRespostaOc(resposta.status, corpo, numeroNormalizado)
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'erro desconhecido'
    return ocIndeterminada(`a consulta de OC falhou: ${mensagem}`)
  }
}
