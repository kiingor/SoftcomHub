// Status de pausa de um atendente, usado tanto no dashboard global de monitoramento
// quanto na tela de monitoramento por setor. Centralizado aqui pra não divergir
// entre as duas telas (antes cada uma tinha sua própria cópia da lógica).
export interface PausaInfo {
  nome: string
  inicio: string
  tempoMaximoMinutos: number | null
}

function getPausaStartMs(pausaInfo: PausaInfo | null | undefined): number | null {
  if (!pausaInfo?.inicio) return null
  const startMs = Date.parse(pausaInfo.inicio)
  return Number.isFinite(startMs) ? startMs : null
}

export function computePausaElapsedMs(pausaInfo: PausaInfo | null | undefined, nowMs: number): number {
  const startMs = getPausaStartMs(pausaInfo)
  if (startMs === null || !Number.isFinite(nowMs)) return 0
  return Math.max(0, nowMs - startMs)
}

// Comparação em milissegundos (não em minutos arredondados) — arredondar pra
// minutos atrasaria o alerta em até quase 1 minuto depois do limite configurado.
export function isPausaEstourada(pausaInfo: PausaInfo | null | undefined, elapsedMs: number): boolean {
  const limitMinutes = pausaInfo?.tempoMaximoMinutos
  return (
    limitMinutes != null
    && Number.isFinite(limitMinutes)
    && limitMinutes >= 0
    && Number.isFinite(elapsedMs)
    && elapsedMs >= 0
    && elapsedMs > limitMinutes * 60000
  )
}

export function formatPausaElapsedLabel(pausaInfo: PausaInfo | null | undefined, elapsedMs: number): string | null {
  if (getPausaStartMs(pausaInfo) === null || !Number.isFinite(elapsedMs) || elapsedMs < 0) return null
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

export function formatPausaStatusLabel(
  pausaInfo: PausaInfo | null | undefined,
  elapsedMs: number,
): string {
  const label = formatPausaLabel(pausaInfo, elapsedMs)
  return isPausaEstourada(pausaInfo, elapsedMs)
    ? `${label} · limite excedido`
    : label
}
