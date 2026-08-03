// Status de urgência de um atendimento, por tempo decorrido sem atribuição ou
// sem 1ª resposta. Mesmo padrão de pausa-status.ts: comparação em ms (não em
// minutos arredondados), pra não atrasar o alerta em quase 1 minuto.

export type AtendimentoStatusLevel = 'normal' | 'atencao' | 'critico'

export const ATENCAO_MINUTOS = 5
export const CRITICO_MINUTOS = 10

const ATENCAO_MS = ATENCAO_MINUTOS * 60_000
const CRITICO_MS = CRITICO_MINUTOS * 60_000

export function computeAtendimentoStatus(elapsedMs: number | null | undefined): AtendimentoStatusLevel {
  if (elapsedMs == null || !Number.isFinite(elapsedMs) || elapsedMs < 0) return 'normal'
  if (elapsedMs >= CRITICO_MS) return 'critico'
  if (elapsedMs >= ATENCAO_MS) return 'atencao'
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
