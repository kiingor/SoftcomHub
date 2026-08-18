/** Intervalo do poll com o servidor respondendo rápido. */
export const POLL_BASE_MS = 3000
/** Teto do intervalo quando o servidor está lento. */
export const POLL_MAX_MS = 30000
/** Quanto o intervalo se afasta em relação ao tempo que a resposta levou. */
const FATOR_LENTIDAO = 2

/**
 * Quanto esperar antes do próximo ciclo, a partir do tempo que o último levou.
 *
 * A regra existe para o cliente parar de gerar carga quando o servidor está
 * sofrendo: respondeu em 200ms, mantém a base; respondeu em 4s, espera 8s. Sem
 * isso, um `setInterval` fixo de 3s dispara o ciclo seguinte antes do anterior
 * voltar e cada chat aberto vira uma fila de requisições em voo — foi o que
 * aconteceu no widget em 18/08/2026.
 *
 * Duração inválida (NaN, negativa) cai na base: melhor consultar de novo cedo do
 * que travar o chat por causa de um relógio estranho.
 */
export function calcularProximoIntervalo(
  duracaoMs: number,
  baseMs: number = POLL_BASE_MS,
  maxMs: number = POLL_MAX_MS,
): number {
  if (!Number.isFinite(duracaoMs) || duracaoMs < 0) return baseMs
  // Teto abaixo da base seria o oposto do que o chamador pediu.
  const teto = Math.max(baseMs, maxMs)
  return Math.min(teto, Math.max(baseMs, duracaoMs * FATOR_LENTIDAO))
}
