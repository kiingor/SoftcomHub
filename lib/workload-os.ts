export type WorkloadOsLevel =
  | 'critical'
  | 'attention'
  | 'light'
  | 'very-light'
  | 'uncovered'
  | 'unavailable'

export type WorkloadOs = {
  ratio: number | null
  formattedRatio: string
  level: WorkloadOsLevel
  label: string
}

const WORKLOAD_RATIO_FORMATTER = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function calculateWorkloadOs(activeTickets: number, onlineAttendants: number): WorkloadOs {
  const tickets = Math.max(0, activeTickets)
  const attendants = Math.max(0, onlineAttendants)

  if (attendants === 0) {
    return {
      ratio: null,
      formattedRatio: '—',
      level: tickets > 0 ? 'uncovered' : 'unavailable',
      label: tickets > 0 ? 'Sem cobertura' : 'Sem atendentes online',
    }
  }

  const ratio = tickets / attendants
  const formattedRatio = WORKLOAD_RATIO_FORMATTER.format(ratio)

  if (ratio >= 2) return { ratio, formattedRatio, level: 'critical', label: 'Crítico' }
  if (ratio >= 1.9) return { ratio, formattedRatio, level: 'attention', label: 'Atenção' }
  if (ratio >= 1.2) return { ratio, formattedRatio, level: 'light', label: 'Leve' }
  return { ratio, formattedRatio, level: 'very-light', label: 'Levíssimo' }
}
