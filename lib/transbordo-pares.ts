// Parte PURA do transbordo entre subsetores — caso #97238.
//
// Separada de `transbordo-subsetor.ts` por um motivo prático: aquele arquivo
// importa `loadRowsByPages` pelo alias `@/`, e o alias não resolve sob
// `node --test`. Qualquer função que morasse lá ficaria sem cobertura, mesmo
// sendo pura. Aqui só entra o que não toca banco — o `import type` abaixo é
// apagado pelo type-stripping do Node, então este arquivo é importável direto
// pelos testes.
//
// A regra em si: o transbordo é unidirecional. Suporte socorre o Prime; o Prime
// só cai para o Suporte quando fica sem NENHUM atendente presente.

import type { ParTransbordo } from '@/lib/distribuicao-fila'

/** Heartbeat mais velho que isto = atendente sumiu, não está presente. */
export const HEARTBEAT_STALE_MS = 5 * 60 * 1000

export function normalizarNomeSubsetor(nome: string | null | undefined): string {
  return (nome || '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    // Depois do NFD, todo acento vira marca combinante (Mn) solta.
    .replace(/\p{Mn}/gu, '')
}

/**
 * As duas linhas que descrevem a política inteira.
 *
 * Sem um dos dois ids não há par nenhum: um setor que só tem Suporte não
 * transborda para lugar algum, e é melhor assim — o ticket segura na fila e o
 * transbordo de SETOR (filial → Matriz) continua possível.
 */
export function montarParesDeTransbordo(
  primeId: string | null | undefined,
  suporteId: string | null | undefined,
): ParTransbordo[] {
  if (!primeId || !suporteId) return []

  return [
    // Suporte transborda para o Prime livremente — desde que a fila do Prime
    // esteja vazia, o que `escolherDestino` já garante. Cliente Prime primeiro.
    { de: suporteId, para: primeId },
    // Prime só cai para o Suporte quando não sobrou ninguém no Prime. Aí o
    // resgate ignora a fila do Suporte: segurar atrás dela adiaria justamente o
    // socorro que acabou de ser autorizado.
    {
      de: primeId,
      para: suporteId,
      somenteSemAtendentePresente: true,
      ignoraFilaDoSocorrista: true,
    },
  ]
}

export interface ColaboradorPresenca {
  is_online?: boolean | null
  ativo?: boolean | null
  last_heartbeat?: string | null
  setores_ativos_sessao?: unknown
}

/**
 * O atendente está PRESENTE neste setor?
 *
 * Presente ≠ disponível: `pausa_atual_id` NÃO entra na conta, de propósito. Quem
 * está no almoço volta, e é por ele que o ticket do Prime espera. Só a ausência
 * real — deslogado, inativo ou com heartbeat morto — libera o socorro do
 * Suporte.
 */
export function estaPresenteNoSetor(
  colaborador: ColaboradorPresenca | null | undefined,
  setorId: string,
  agoraMs: number = Date.now(),
): boolean {
  if (!colaborador?.is_online || !colaborador.ativo) return false

  const heartbeatMs = colaborador.last_heartbeat ? Date.parse(colaborador.last_heartbeat) : NaN
  if (!Number.isFinite(heartbeatMs) || agoraMs - heartbeatMs >= HEARTBEAT_STALE_MS) return false

  const setoresAtivos = Array.isArray(colaborador.setores_ativos_sessao)
    ? colaborador.setores_ativos_sessao
    : []
  return setoresAtivos.includes(setorId)
}
