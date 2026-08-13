// Parte PURA da checagem de OC (ocorrência do Service Desk) — caso #97240.
//
// Separada do fetch pelo mesmo motivo de `transbordo-pares.ts`: o alias `@/` não
// resolve sob `node --test`, então tudo que DECIDE alguma coisa mora aqui, sem
// import de valor, e `oc-ticket-consulta.ts` fica só com a chamada de rede.
//
// A regra que vale mais que o bloqueio em si: NUNCA travar o encerramento por
// causa de infraestrutura externa. Só uma resposta que diz claramente "não
// existe OC para este ticket" bloqueia. Qualquer outra coisa — o 401 que a API
// responde HOJE (a chave ainda não existe em nenhum ambiente), 5xx, timeout,
// JSON que não reconhecemos — libera e avisa no console. O caso quer impedir
// descuido do atendente, não transformar instabilidade de API em fila parada.
//
// Ninguém viu ainda uma resposta de sucesso deste endpoint, então o parsing é
// deliberadamente tolerante: formato reconhecido vira veredito, formato
// desconhecido vira "não consegui verificar" (= libera), NUNCA "não existe"
// (= bloqueia).

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
  | { tipo: 'desconhecido' }

function inspecionar(payload: unknown, profundidade = 0): Achado {
  // `200` com corpo `null` é o jeito idiomático de dizer "não achei" numa busca
  // por chave, que é exatamente o formato desta rota (/tickets/numero/{numero}).
  if (payload === null) return { tipo: 'vazio' }

  if (Array.isArray(payload)) {
    const registro = payload.find(isRegistro)
    if (registro) return { tipo: 'registro', registro }
    return payload.length === 0 ? { tipo: 'vazio' } : { tipo: 'desconhecido' }
  }

  if (!isRegistro(payload)) return { tipo: 'desconhecido' }
  if (extrairIdentificacao(payload)) return { tipo: 'registro', registro: payload }
  if (profundidade >= 3) return { tipo: 'desconhecido' }

  for (const chave of CHAVES_ENVELOPE) {
    if (!(chave in payload)) continue
    const achado = inspecionar(payload[chave], profundidade + 1)
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
 * Traduz a resposta HTTP crua em veredito.
 *
 * Recebe o corpo como texto (e não como objeto já parseado) de propósito: assim
 * "a API devolveu algo que não é JSON" também é um caso testável aqui, sem
 * precisar de rede.
 */
export function interpretarRespostaOc(status: number, corpo: string | null | undefined): ConsultaOc {
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

  const achado = inspecionar(payload)
  if (achado.tipo === 'vazio') return { situacao: 'sem-oc', identificacao: null, motivo: null }
  if (achado.tipo === 'desconhecido') {
    return ocIndeterminada(`a API respondeu ${status} num formato que não reconhecemos`)
  }

  return {
    situacao: 'com-oc',
    identificacao: extrairIdentificacao(achado.registro),
    motivo: null,
  }
}

/**
 * A decisão final. Duas linhas do caso inteiro moram aqui: sem a flag nada muda,
 * e só `sem-oc` bloqueia.
 */
export function decidirEncerramento(
  flagLigada: boolean,
  consulta: ConsultaOc | null,
): DecisaoEncerramento {
  if (!flagLigada) return { permite: true, bloqueio: null, aviso: null }

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
