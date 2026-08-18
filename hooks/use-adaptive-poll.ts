'use client'

import { useEffect, useRef } from 'react'
import { POLL_BASE_MS, POLL_MAX_MS, calcularProximoIntervalo } from '@/lib/poll-intervalo'

interface OpcoesPoll {
  /** Enquanto false, nenhum ciclo é agendado. */
  ativo?: boolean
  /** Intervalo com o servidor respondendo rápido. */
  baseMs?: number
  /** Teto do intervalo quando o servidor está lento. */
  maxMs?: number
}

/**
 * Poll que não empilha requisição e recua sozinho quando o servidor está lento.
 *
 * O widget usava `setInterval(fn, 3000)`. Quando o backend passou a responder em
 * 3–5s (banco saturado, medido em 18/08/2026), o ciclo seguinte partia antes do
 * anterior voltar: cada chat aberto acumulava requisições em voo e virava gerador
 * de carga — quanto mais lento o servidor, mais requisição o cliente criava. Uma
 * rajada desse tipo derrubou a API do Supabase (99 respostas 521 em 2 segundos,
 * 84 delas em /rest/v1/tickets).
 *
 * Aqui o próximo ciclo só é agendado DEPOIS que o anterior termina, com o
 * intervalo de `calcularProximoIntervalo`. Aba escondida não consulta nada e
 * retoma assim que reaparece — só a primeira carga acontece mesmo escondida,
 * senão a tela ficaria presa no "carregando".
 */
export function useAdaptivePoll(
  fn: () => Promise<unknown>,
  { ativo = true, baseMs = POLL_BASE_MS, maxMs = POLL_MAX_MS }: OpcoesPoll = {},
) {
  // A função muda de identidade a cada render (useCallback com deps de estado).
  // Guardar em ref evita reiniciar o ciclo — e o próximo ciclo já usa a nova.
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!ativo) return

    let cancelado = false
    let primeiroCiclo = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const escondido = () => document.visibilityState === 'hidden'

    const ciclo = async () => {
      if (cancelado) return
      if (escondido() && !primeiroCiclo) return // retoma no visibilitychange
      primeiroCiclo = false

      const inicio = Date.now()
      try {
        await fnRef.current()
      } finally {
        if (!cancelado) {
          timer = setTimeout(ciclo, calcularProximoIntervalo(Date.now() - inicio, baseMs, maxMs))
        }
      }
    }

    const aoReaparecer = () => {
      if (cancelado || escondido()) return
      clearTimeout(timer)
      ciclo()
    }

    ciclo()
    document.addEventListener('visibilitychange', aoReaparecer)

    return () => {
      cancelado = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', aoReaparecer)
    }
  }, [ativo, baseMs, maxMs])
}
