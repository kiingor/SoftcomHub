// Rótulos de status de ticket, num lugar só.
//
// Existiam três traduções paralelas — a tabela de relatórios, a distribuição por
// status e o export CSV/XLSX — e nenhuma conhecia `avaliar`. As duas primeiras
// usavam um ternário que caía em 'Aberto' para qualquer status desconhecido, o
// que fazia um ticket em avaliação ser reportado como aberto.
//
// Status existentes na base (verificado em 27/07/2026, 49.859 tickets):
// encerrado 49.685 · em_atendimento 138 · avaliar 22 · aberto 14.

export type TicketStatus = 'aberto' | 'em_atendimento' | 'avaliar' | 'encerrado'

const LABELS: Record<string, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  avaliar: 'Em avaliação',
  encerrado: 'Finalizado',
}

/** Versão curta, para colunas estreitas de tabela. */
const LABELS_CURTOS: Record<string, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em atend.',
  avaliar: 'Avaliação',
  encerrado: 'Finalizado',
}

/**
 * Rótulo do status. Um status desconhecido volta como veio, em vez de virar
 * outro status — apresentar 'avaliar' como 'Aberto' é pior do que mostrar o
 * valor cru, porque o relatório fica silenciosamente errado.
 */
export function formatTicketStatus(status: string | null | undefined): string {
  if (!status) return ''
  return LABELS[status] ?? status
}

export function formatTicketStatusCurto(status: string | null | undefined): string {
  if (!status) return ''
  return LABELS_CURTOS[status] ?? status
}

/** Classe de cor do badge por status. Vazio quando o status é desconhecido. */
export function ticketStatusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case 'encerrado':
      return 'bg-green-100 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800'
    case 'em_atendimento':
      return 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800'
    case 'avaliar':
      return 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800'
    case 'aberto':
      return 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800'
    default:
      return ''
  }
}
