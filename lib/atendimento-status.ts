// Status de urgência de um atendimento, por tempo decorrido sem atribuição ou
// sem 1ª resposta. Mesmo padrão de pausa-status.ts: comparação em ms (não em
// minutos arredondados), pra não atrasar o alerta em quase 1 minuto.

export type AtendimentoStatusLevel = 'normal' | 'atencao' | 'critico'

export interface AtendimentoStatusThresholds {
  atencaoMinutos?: number | null
  criticoMinutos?: number | null
}

export interface ResolvedAtendimentoStatusThresholds {
  atencaoMinutos: number
  criticoMinutos: number
}

export const DEFAULT_ATENCAO_MINUTOS = 30
export const DEFAULT_CRITICO_MINUTOS = 40
export const MIN_ATENDIMENTO_STATUS_MINUTOS = 1
export const MAX_ATENDIMENTO_STATUS_MINUTOS = 1_440

// Mantidos para não quebrar consumidores que já usavam os limites originais.
export const ATENCAO_MINUTOS = DEFAULT_ATENCAO_MINUTOS
export const CRITICO_MINUTOS = DEFAULT_CRITICO_MINUTOS

const DEFAULT_THRESHOLDS: ResolvedAtendimentoStatusThresholds = {
  atencaoMinutos: DEFAULT_ATENCAO_MINUTOS,
  criticoMinutos: DEFAULT_CRITICO_MINUTOS,
}

function isValidStatusMinute(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= MIN_ATENDIMENTO_STATUS_MINUTOS
    && value <= MAX_ATENDIMENTO_STATUS_MINUTOS
}

export function isValidAtendimentoStatusThresholds(
  thresholds: AtendimentoStatusThresholds | null | undefined,
): thresholds is ResolvedAtendimentoStatusThresholds {
  if (!thresholds) return false

  return isValidStatusMinute(thresholds.atencaoMinutos)
    && isValidStatusMinute(thresholds.criticoMinutos)
    && thresholds.criticoMinutos > thresholds.atencaoMinutos
}

export function resolveAtendimentoStatusThresholds(
  thresholds?: AtendimentoStatusThresholds | null,
): ResolvedAtendimentoStatusThresholds {
  if (!isValidAtendimentoStatusThresholds(thresholds)) return DEFAULT_THRESHOLDS

  return {
    atencaoMinutos: thresholds.atencaoMinutos,
    criticoMinutos: thresholds.criticoMinutos,
  }
}

export function computeAtendimentoStatus(
  elapsedMs: number | null | undefined,
  thresholds?: AtendimentoStatusThresholds | null,
): AtendimentoStatusLevel {
  if (elapsedMs == null || !Number.isFinite(elapsedMs) || elapsedMs < 0) return 'normal'

  const { atencaoMinutos, criticoMinutos } = resolveAtendimentoStatusThresholds(thresholds)
  if (elapsedMs >= criticoMinutos * 60_000) return 'critico'
  if (elapsedMs >= atencaoMinutos * 60_000) return 'atencao'
  return 'normal'
}

const LABELS: Record<AtendimentoStatusLevel, string> = {
  normal: 'Normal',
  atencao: 'Atenção',
  critico: 'Crítico',
}

export function formatAtendimentoStatusLabel(level: AtendimentoStatusLevel): string {
  return LABELS[level]
}

/** Classe de cor do badge por nível. Segue a paleta já usada em ticket-status.ts. */
export function atendimentoStatusBadgeClass(level: AtendimentoStatusLevel): string {
  switch (level) {
    case 'critico':
      return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800'
    case 'atencao':
      return 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}
