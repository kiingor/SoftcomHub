// Parte PURA da checagem de OC (ocorrência do Service Desk) — caso #97240.
//
// Separada do fetch pelo mesmo motivo de `transbordo-pares.ts`: o alias `@/` não
// resolve sob `node --test`, então tudo que DECIDE alguma coisa mora aqui, sem
// import de valor, e `oc-ticket-consulta.ts` fica só com a chamada de rede.
//
// A regra que vale mais que o bloqueio em si: NUNCA travar o encerramento por
// causa de infraestrutura externa. Só uma resposta que diz claramente "não
// existe OC para este ticket" bloqueia. Qualquer outra coisa — 401, 5xx,
// timeout, JSON que não reconhecemos — libera e avisa no console. O caso quer
// impedir descuido do atendente, não transformar instabilidade de API em fila
// parada.
//
// O formato real da resposta é conhecido (ver `oc-ticket-consulta.ts`): uma
// LISTA de OCs, cada uma com `id` e `ticket`. O parsing continua tolerante a
// envelopes porque o contrato não é versionado e não é nosso — formato
// reconhecido vira veredito, formato desconhecido vira "não consegui
// verificar" (= libera), NUNCA "não existe" (= bloqueia).
//
// Uma conferência a mais existe por um motivo medido: o campo `ticket` da
// agenda é digitável e guarda lixo de outras origens (`999999999` devolve OCs
// reais). Hoje isso não colide com o Hub — `tickets.numero` é SERIAL, na casa
// dos 164 mil — mas um registro cujo `ticket` CONTRADIZ o número consultado
// significa que o filtro não é o que entendemos, e aí a resposta certa é
// "não consegui verificar", não um veredito.

/** Nome da variável de ambiente que liga a trava. Desligada por padrão. */
export const OC_FLAG_ENV = 'OC_OBRIGATORIA_PARA_ENCERRAR'

export type SituacaoOc = 'com-oc' | 'sem-oc' | 'indeterminado'

export interface ConsultaOc {
  situacao: SituacaoOc
  /** Número/código da OC para mostrar ao atendente, quando a resposta trouxer. */
  identificacao: string | null
  /** Por que não deu para verificar. Só existe em `indeterminado`. */
  motivo: string | null
}

export interface DecisaoEncerramento {
  permite: boolean
  /** Texto mostrado ao atendente quando o encerramento está travado. */
  bloqueio: string | null
  /** Motivo do fail-open, para `console.warn`. Só existe quando não deu para verificar. */
  aviso: string | null
}

export const MENSAGEM_SEM_OC =
  'Não encontramos nenhuma OC aberta para este ticket no Service Desk. '
  + 'Abra a ocorrência rápida antes de encerrar o atendimento.'

type RegistroDesconhecido = Record<string, unknown>

/**
 * Campos que, se presentes e preenchidos, identificam uma OC/ticket de verdade.
 * Serve de duas coisas ao mesmo tempo: reconhecer o registro no meio do payload
 * e ter o que exibir ao atendente. A ordem é a de preferência para exibição.
 *
 * `ticket` NÃO entra aqui de propósito: ele é o número do ticket do Hub, que o
 * atendente já está vendo na tela. Mostrar "a OC 164347" quando 164347 é o
 * ticket seria confundir os dois números. Na resposta real quem identifica a OC
 * é `id`, o último da lista.
 */
const CAMPOS_IDENTIFICACAO = [
  'numero',
  'numeroOcorrencia',
  'numero_ocorrencia',
  'codigo',
  'protocolo',
  'id',
] as const

/** Chaves de envelope plausíveis, já que o contrato real é desconhecido. */
const CHAVES_ENVELOPE = [
  'data',
  'ocorrencia',
  'ocorrencias',
  'ticket',
  'tickets',
  'items',
  'results',
  'content',
  'registros',
] as const

function isRegistro(valor: unknown): valor is RegistroDesconhecido {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function comoTexto(valor: unknown): string | null {
  if (typeof valor === 'string') return valor.trim() || null
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  return null
}

function extrairIdentificacao(registro: RegistroDesconhecido): string | null {
  for (const campo of CAMPOS_IDENTIFICACAO) {
    const texto = comoTexto(registro[campo])
    if (texto) return texto
  }
  return null
}

type Achado =
  | { tipo: 'registro'; registro: RegistroDesconhecido }
  /** Coleção explicitamente vazia — a única evidência aceitável de "não tem OC". */
  | { tipo: 'vazio' }
  /** Vieram OCs, mas de OUTRO ticket: o filtro não é o que entendemos. */
  | { tipo: 'outro-ticket' }
  | { tipo: 'desconhecido' }

/**
 * A OC é deste ticket? Só responde `false` com evidência: o registro traz
 * `ticket` E ele é outro número. Registro sem o campo passa — não dá para
 * conferir, e aceitar cai no lado que LIBERA o encerramento.
 */
function ehDoTicket(registro: RegistroDesconhecido, numeroEsperado: string): boolean {
  if (!numeroEsperado) return true
  const doRegistro = comoTexto(registro.ticket)
  if (!doRegistro) return true
  return doRegistro.trim() === numeroEsperado
}

function inspecionar(payload: unknown, numeroEsperado: string, profundidade = 0): Achado {
  // `200` com corpo `null` é o jeito idiomático de dizer "não achei" numa busca
  // por chave, que é exatamente o formato desta rota (/tickets/numero/{numero}).
  if (payload === null) return { tipo: 'vazio' }

  if (Array.isArray(payload)) {
    const registros = payload.filter(isRegistro)
    if (registros.length === 0) {
      return payload.length === 0 ? { tipo: 'vazio' } : { tipo: 'desconhecido' }
    }

    const registro = registros.find((item) => ehDoTicket(item, numeroEsperado))
    return registro ? { tipo: 'registro', registro } : { tipo: 'outro-ticket' }
  }

  if (!isRegistro(payload)) return { tipo: 'desconhecido' }
  if (extrairIdentificacao(payload)) {
    return ehDoTicket(payload, numeroEsperado)
      ? { tipo: 'registro', registro: payload }
      : { tipo: 'outro-ticket' }
  }
  if (profundidade >= 3) return { tipo: 'desconhecido' }

  for (const chave of CHAVES_ENVELOPE) {
    if (!(chave in payload)) continue
    const achado = inspecionar(payload[chave], numeroEsperado, profundidade + 1)
    if (achado.tipo !== 'desconhecido') return achado
  }

  return { tipo: 'desconhecido' }
}

/** Consulta que não concluiu nada — o estado que LIBERA o encerramento. */
export function ocIndeterminada(motivo: string): ConsultaOc {
  return { situacao: 'indeterminado', identificacao: null, motivo }
}

/**
 * A flag só liga com um valor afirmativo explícito. Ausente, vazia ou qualquer
 * outra coisa = desligada, que é o comportamento de hoje.
 */
export function ocObrigatoriaLigada(valor: string | null | undefined): boolean {
  const normalizado = (valor || '').trim().toLowerCase()
  return normalizado === '1'
    || normalizado === 'true'
    || normalizado === 'sim'
    || normalizado === 'on'
}

/**
 * Tudo que decide se a OC é exigida NESTE ticket. Três perguntas, nesta ordem,
 * e qualquer uma delas isenta:
 *
 *   1. a flag global está ligada?      (botão de pânico — desliga o recurso inteiro)
 *   2. o setor do ticket optou?        (rollout gradual, setor a setor)
 *   3. o ticket NÃO é de disparo?      (quem dispara não abre OC)
 *
 * A ordem importa para o custo: se a exigência não vale, `/api/oc` nem chega a
 * bater na API externa.
 */
export interface ContextoExigenciaOc {
  /** `OC_OBRIGATORIA_PARA_ENCERRAR`. Desligada = nada muda em lugar nenhum. */
  flagGlobal: boolean
  /**
   * `setores.oc_obrigatoria_para_encerrar` do setor do ticket. `null`/`undefined`
   * cobre dois casos que dão no mesmo: a coluna ainda não existe no ambiente, ou
   * o ticket não tem setor. Os dois isentam.
   */
  setorExige: boolean | null | undefined
  /** Ticket nascido de disparo — isento por decisão do caso. */
  ehDisparo: boolean
}

export function exigirOcNoTicket({
  flagGlobal,
  setorExige,
  ehDisparo,
}: ContextoExigenciaOc): boolean {
  if (!flagGlobal) return false
  // `!== true` de propósito: só o `true` explícito exige. Ausência não exige.
  if (setorExige !== true) return false
  return !ehDisparo
}

/**
 * O ticket nasceu de um disparo?
 *
 * `is_disparo` e `disparo_em` andam juntos hoje (13.696 encerrados em cada,
 * medido em 13/08/2026), mas conferir os dois custa nada e cobre o dia em que
 * um caminho novo gravar só um deles.
 *
 * ATENÇÃO: o disparo pela Evolution (`app/api/evolution/dispatch/route.ts`) NÃO
 * grava marcador nenhum — de propósito, porque `is_disparo` também tranca o
 * envio até o cliente responder. Esses tickets, portanto, NÃO são isentos aqui.
 */
export function ticketEhDisparo(
  ticket: { is_disparo?: boolean | null; disparo_em?: string | null } | null | undefined,
): boolean {
  if (!ticket) return false
  return ticket.is_disparo === true || Boolean(ticket.disparo_em)
}

/**
 * Traduz a resposta HTTP crua em veredito.
 *
 * Recebe o corpo como texto (e não como objeto já parseado) de propósito: assim
 * "a API devolveu algo que não é JSON" também é um caso testável aqui, sem
 * precisar de rede.
 *
 * `numeroEsperado` é o número do ticket do Hub que foi consultado. Serve para
 * conferir o `ticket` de cada OC devolvida; omiti-lo desliga a conferência.
 */
export function interpretarRespostaOc(
  status: number,
  corpo: string | null | undefined,
  numeroEsperado?: number | string | null,
): ConsultaOc {
  // A rota existe e responde — um 404 dela é sobre o ticket, não sobre o caminho.
  if (status === 404) return { situacao: 'sem-oc', identificacao: null, motivo: null }

  if (status < 200 || status > 299) {
    return ocIndeterminada(`a API respondeu ${status}`)
  }

  const texto = (corpo || '').trim()
  if (!texto) return ocIndeterminada(`a API respondeu ${status} com corpo vazio`)

  let payload: unknown
  try {
    payload = JSON.parse(texto)
  } catch {
    return ocIndeterminada(`a API respondeu ${status} com um corpo que não é JSON`)
  }

  const achado = inspecionar(payload, String(numeroEsperado ?? '').trim())
  if (achado.tipo === 'vazio') return { situacao: 'sem-oc', identificacao: null, motivo: null }
  if (achado.tipo === 'desconhecido') {
    return ocIndeterminada(`a API respondeu ${status} num formato que não reconhecemos`)
  }
  if (achado.tipo === 'outro-ticket') {
    // Não é "sem OC": é "a resposta não fala do ticket que perguntamos".
    return ocIndeterminada(`a API respondeu ${status} com OC de outro ticket`)
  }

  return {
    situacao: 'com-oc',
    identificacao: extrairIdentificacao(achado.registro),
    motivo: null,
  }
}

/**
 * A decisão final. Duas linhas do caso inteiro moram aqui: sem exigência nada
 * muda, e só `sem-oc` bloqueia.
 *
 * `exigencia` é o resultado de `exigirOcNoTicket` — já considera flag global,
 * opt-in do setor e isenção de disparo.
 */
export function decidirEncerramento(
  exigencia: boolean,
  consulta: ConsultaOc | null,
): DecisaoEncerramento {
  if (!exigencia) return { permite: true, bloqueio: null, aviso: null }

  if (!consulta) {
    return { permite: true, bloqueio: null, aviso: 'a consulta de OC não chegou a rodar' }
  }

  if (consulta.situacao === 'sem-oc') {
    return { permite: false, bloqueio: MENSAGEM_SEM_OC, aviso: null }
  }

  if (consulta.situacao === 'indeterminado') {
    return {
      permite: true,
      bloqueio: null,
      aviso: consulta.motivo || 'não foi possível verificar a OC',
    }
  }

  return { permite: true, bloqueio: null, aviso: null }
}

/**
 * Aviso de "a OC já está aberta", mostrado antes de o atendente abrir outra.
 * Informa, não impede — pode haver motivo legítimo para uma segunda OC.
 */
export function descreverOcExistente(
  consulta: Pick<ConsultaOc, 'situacao' | 'identificacao'> | null | undefined,
): string | null {
  if (consulta?.situacao !== 'com-oc') return null
  return consulta.identificacao
    ? `A OC ${consulta.identificacao} já está aberta para este ticket.`
    : 'Já existe uma OC aberta para este ticket.'
}
