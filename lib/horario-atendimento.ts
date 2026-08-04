/**
 * Quanto de um intervalo caiu dentro do expediente do setor.
 *
 * Sem isto, o "maior tempo de espera em fila" premia quem escreve de madrugada:
 * medido em 04/08/2026 no ServiceDesk, o #155513 chegou 00:28 e foi atendido
 * 07:05 — cinco minutos depois de abrir — e aparecia como 6h37 de espera. A
 * pior espera real do dia, dentro do horário, era de 15 minutos.
 *
 * `horarios_atendimento` guarda hora local de Brasília e os timestamps do banco
 * são UTC — mesma premissa de `lib/transbordo-bloqueio.ts`.
 */

const FUSO = 'America/Sao_Paulo'
const DIA_MS = 86_400_000

export type HorarioAtendimento = {
  /** 0 = domingo … 6 = sábado. */
  dia_semana?: number | null
  ativo?: boolean | null
  /** "HH:MM:SS" no fuso de Brasília. */
  hora_inicio?: string | null
  hora_fim?: string | null
}

/**
 * Deslocamento de Brasília no instante, em ms.
 *
 * Via `Intl` em vez de constante -3h: o Brasil não tem horário de verão desde
 * 2019, mas se voltar a ter, uma constante passaria a errar uma hora por seis
 * meses sem ninguém notar.
 */
function deslocamentoBrasilia(instanteMs: number): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instanteMs)

  const campo = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0)
  // `hour` sai como 24 na virada em `hour12: false`; 24 % 24 = 0 mantém o dia.
  const comoSeFosseUtc = Date.UTC(
    campo('year'),
    campo('month') - 1,
    campo('day'),
    campo('hour') % 24,
    campo('minute'),
    campo('second'),
  )
  return comoSeFosseUtc - instanteMs
}

function minutosDoDia(hora: string | null | undefined): number | null {
  const partes = String(hora ?? '').split(':')
  if (partes.length < 2) return null
  const h = Number(partes[0])
  const m = Number(partes[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return (h * 60 + m) * 60_000
}

/**
 * Janelas de funcionamento que tocam o intervalo, em ms UTC.
 *
 * Varre um dia a mais de cada lado porque uma janela que fecha às 02:00
 * pertence ao dia anterior — sexta e sábado do ServiceDesk são assim.
 */
function janelasAbertas(
  deMs: number,
  ateMs: number,
  porDiaSemana: Map<number, HorarioAtendimento>,
): Array<[number, number]> {
  const deslocamento = deslocamentoBrasilia(deMs)
  const janelas: Array<[number, number]> = []

  const primeiroDia = Math.floor((deMs + deslocamento) / DIA_MS) - 1
  const ultimoDia = Math.floor((ateMs + deslocamento) / DIA_MS) + 1

  for (let dia = primeiroDia; dia <= ultimoDia; dia++) {
    const meiaNoiteUtc = dia * DIA_MS - deslocamento
    // +1h evita que um deslocamento de borda jogue o dia da semana para trás.
    const diaSemana = new Date(meiaNoiteUtc + deslocamento + 3_600_000).getUTCDay()

    const horario = porDiaSemana.get(diaSemana)
    if (!horario || horario.ativo === false) continue

    const inicio = minutosDoDia(horario.hora_inicio)
    const fimBruto = minutosDoDia(horario.hora_fim)
    if (inicio === null || fimBruto === null) continue

    // Fechar antes ou na hora de abrir significa atravessar a meia-noite:
    // "07:00 → 00:00" vai até a meia-noite seguinte, "07:00 → 02:00" além dela.
    const fim = fimBruto <= inicio ? fimBruto + DIA_MS : fimBruto
    janelas.push([meiaNoiteUtc + inicio, meiaNoiteUtc + fim])
  }

  return janelas
}

/**
 * Cria o medidor usado pelos indicadores de fila.
 *
 * Devolve `null` quando o setor não tem expediente utilizável — sem horário
 * cadastrado a conta tem de seguir em tempo corrido, e não zerada, senão toda
 * espera sumiria.
 */
export function criarMedidorDeExpediente(
  horarios: readonly HorarioAtendimento[] | null | undefined,
): ((deMs: number, ateMs: number) => number) | null {
  const porDiaSemana = new Map<number, HorarioAtendimento>()
  for (const horario of horarios || []) {
    if (horario.ativo === false) continue
    if (typeof horario.dia_semana !== 'number') continue
    if (minutosDoDia(horario.hora_inicio) === null) continue
    if (minutosDoDia(horario.hora_fim) === null) continue
    porDiaSemana.set(horario.dia_semana, horario)
  }
  if (porDiaSemana.size === 0) return null

  return (deMs, ateMs) => {
    if (!(ateMs > deMs)) return 0
    let total = 0
    for (const [abre, fecha] of janelasAbertas(deMs, ateMs, porDiaSemana)) {
      total += Math.max(0, Math.min(ateMs, fecha) - Math.max(deMs, abre))
    }
    return total
  }
}
