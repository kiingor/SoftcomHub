// Status de pausa de um atendente, usado tanto no dashboard global de monitoramento
// quanto na tela de monitoramento por setor. Centralizado aqui pra não divergir
// entre as duas telas (antes cada uma tinha sua própria cópia da lógica).
export interface PausaInfo {
  nome: string
  inicio: string
  tempoMaximoMinutos: number | null
}

export function computePausaElapsedMs(pausaInfo: PausaInfo | null | undefined, nowMs: number): number {
  if (!pausaInfo?.inicio) return 0
  return nowMs - new Date(pausaInfo.inicio).getTime()
}

// Comparação em milissegundos (não em minutos arredondados) — arredondar pra
// minutos atrasaria o alerta em até quase 1 minuto depois do limite configurado.
export function isPausaEstourada(pausaInfo: PausaInfo | null | undefined, elapsedMs: number): boolean {
  return pausaInfo?.tempoMaximoMinutos != null && elapsedMs > pausaInfo.tempoMaximoMinutos * 60000
}

export function formatPausaElapsedLabel(pausaInfo: PausaInfo | null | undefined, elapsedMs: number): string | null {
  if (!pausaInfo?.inicio) return null
  const hours = String(Math.floor(elapsedMs / 3600000)).padStart(2, '0')
  const minutes = String(Math.floor((elapsedMs % 3600000) / 60000)).padStart(2, '0')
  const seconds = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

// Nunca retorna "Pausa · null" — se o tempo decorrido ainda não pôde ser
// calculado (dados da pausa ainda carregando), mostra só o nome da pausa.
export function formatPausaLabel(pausaInfo: PausaInfo | null | undefined, elapsedMs: number): string {
  const label = formatPausaElapsedLabel(pausaInfo, elapsedMs)
  const nome = pausaInfo?.nome || 'Pausa'
  return label ? `${nome} · ${label}` : nome
}
