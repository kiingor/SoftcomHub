// Caso #97218 — a supervisão corrige o TIPO da pausa que o atendente escolheu.
//
// Parte PURA da decisão: quem pode mexer no status/na pausa de quem, e o que
// pode ser feito com a instância de pausa que está aberta. Separada da rota pelo
// mesmo motivo de lib/transbordo-pares.ts: o alias `@/` não resolve sob
// `node --test`, então qualquer função que morasse junto do acesso ao banco
// ficaria sem cobertura possível. Aqui só entra o que não toca banco.
//
// ── POR QUE `temEscopoNoSetor` CHEGA INJETADO ───────────────────────────────
// A única definição de "supervisor" do sistema é `hasSupervisorScope`, em
// lib/transfer-authorization.ts. Copiá-la aqui criaria um terceiro critério que
// divergiria na primeira mudança de regra; importá-la deixaria este arquivo
// inimportável ou pelo Node (`@/` não resolve) ou pelo tsc (caminho relativo com
// `.ts` exige allowImportingTsExtensions, e sem extensão o Node não acha). Então
// ela entra como argumento: a rota passa `hasSupervisorScope`, a tela passa
// `hasSupervisorScope`, e o teste passa a MESMA função. Uma definição só.

export interface AtorDaSupervisao {
  /** colaboradores.id de quem chamou — resolvido por e-mail, como em requireAdmin. */
  id: string
  /** `(setorId) => hasSupervisorScope(ator, setorId)`. Ver o bloco acima. */
  temEscopoNoSetor: (setorId: string) => boolean
}

/**
 * A INSTÂNCIA de pausa que está rolando — linha de `pausas_colaboradores`, não
 * o tipo em `pausas`. É a distinção que `colaboradores.pausa_atual_id` faz:
 * ele aponta para a instância; mandar um id do catálogo grava FK inválida.
 */
export interface PausaAberta {
  id: string
  /** pausas_colaboradores.pausa_id — o TIPO que está valendo agora. */
  pausaId: string
  setorId: string
}

export interface AlvoDaSupervisao {
  colaboradorId: string
  /** colaboradores_setores + o legado colaboradores.setor_id (nulo em quase todo mundo). */
  setorIds: string[]
  pausaAberta: PausaAberta | null
}

/** Linha do catálogo `pausas`. */
export interface TipoDePausa {
  id: string
  setorId: string
  ativo: boolean
}

export type MotivoRecusa =
  | 'FORA_DO_ESCOPO'
  | 'SEM_PAUSA_ABERTA'
  | 'TIPO_INEXISTENTE'
  | 'TIPO_INATIVO'
  | 'TIPO_DE_OUTRO_SETOR'
  | 'MESMO_TIPO'

export type AvaliacaoDaTroca =
  | {
      permitido: true
      /** pausas_colaboradores.id — a linha que recebe o UPDATE. */
      instanciaId: string
      deTipoId: string
      paraTipoId: string
      setorId: string
    }
  | { permitido: false; motivo: MotivoRecusa }

/**
 * Pode mexer no status (online/offline/pausa) desta pessoa?
 *
 * O próprio colaborador sempre pode: é o WorkDesk quem chama a rota o dia
 * inteiro, e fechá-la para ele derrubaria o uso normal do sistema. Para
 * TERCEIROS o alcance é o vínculo — supervisor só manda em setor a que ele está
 * ligado, e o vínculo real do alvo está em `colaboradores_setores`, não na
 * coluna legada `colaboradores.setor_id`.
 */
export function podeAlterarStatusDe(ator: AtorDaSupervisao, alvo: AlvoDaSupervisao): boolean {
  if (ator.id === alvo.colaboradorId) return true
  return alvo.setorIds.some((setorId) => ator.temEscopoNoSetor(setorId))
}

/**
 * Trocar o TIPO da pausa aberta é permitido? E, se for, sobre qual linha?
 *
 * O escopo é conferido DUAS vezes, de propósito e por motivos diferentes:
 *
 *   1. sobre a PESSOA (`podeAlterarStatusDe`) — é o mesmo portão do
 *      online/offline, e responder antes de olhar a pausa evita contar a quem
 *      não tem nada com isso se o fulano está ou não em pausa.
 *   2. sobre o SETOR DA PAUSA — o relatório de pausa é agrupado por setor.
 *      Quem reetiqueta uma pausa que conta no relatório do setor X tem que ser
 *      supervisor de X, e não de um outro setor onde a pessoa também trabalha.
 *
 * O tipo de destino precisa ser do MESMO setor da instância pela mesma razão:
 * corrigir o rótulo não pode mover a ausência para o relatório de outro setor.
 */
export function avaliarTrocaDePausa(
  ator: AtorDaSupervisao,
  alvo: AlvoDaSupervisao,
  tipoDestino: TipoDePausa | null | undefined,
): AvaliacaoDaTroca {
  if (!podeAlterarStatusDe(ator, alvo)) return { permitido: false, motivo: 'FORA_DO_ESCOPO' }

  const pausa = alvo.pausaAberta
  if (!pausa) return { permitido: false, motivo: 'SEM_PAUSA_ABERTA' }

  const ehOProprio = ator.id === alvo.colaboradorId
  if (!ehOProprio && !ator.temEscopoNoSetor(pausa.setorId)) {
    return { permitido: false, motivo: 'FORA_DO_ESCOPO' }
  }

  if (!tipoDestino) return { permitido: false, motivo: 'TIPO_INEXISTENTE' }
  if (!tipoDestino.ativo) return { permitido: false, motivo: 'TIPO_INATIVO' }
  if (tipoDestino.setorId !== pausa.setorId) return { permitido: false, motivo: 'TIPO_DE_OUTRO_SETOR' }
  // Reescolher o mesmo tipo não é troca: sem isto viraria um UPDATE no-op que
  // ainda assim gastaria uma linha de auditoria dizendo "X virou X".
  if (tipoDestino.id === pausa.pausaId) return { permitido: false, motivo: 'MESMO_TIPO' }

  return {
    permitido: true,
    instanciaId: pausa.id,
    deTipoId: pausa.pausaId,
    paraTipoId: tipoDestino.id,
    setorId: pausa.setorId,
  }
}

/** Mensagem e status HTTP de cada recusa. A tela mostra o texto como veio. */
export const RECUSA_DA_TROCA: Record<MotivoRecusa, { erro: string; status: number }> = {
  FORA_DO_ESCOPO: {
    erro: 'Você não pode alterar a pausa de um atendente de um setor ao qual não está vinculado',
    status: 403,
  },
  SEM_PAUSA_ABERTA: {
    erro: 'Este atendente não está em pausa — não há tipo de pausa para trocar',
    status: 409,
  },
  TIPO_INEXISTENTE: { erro: 'Tipo de pausa não encontrado', status: 404 },
  TIPO_INATIVO: { erro: 'Este tipo de pausa está inativo', status: 422 },
  TIPO_DE_OUTRO_SETOR: {
    erro: 'O tipo de pausa escolhido pertence a outro setor',
    status: 422,
  },
  MESMO_TIPO: { erro: 'O atendente já está neste tipo de pausa', status: 409 },
}
