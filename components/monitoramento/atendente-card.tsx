'use client'

import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { computePausaElapsedMs, formatPausaLabel, isPausaEstourada } from '@/lib/pausa-status'
import { cn } from '@/lib/utils'

export interface PausaInfo {
  nome: string
  inicio: string
  tempoMaximoMinutos: number | null
}

export interface AtendenteCardProps {
  nome: string
  isOnline: boolean
  pausaInfo?: PausaInfo | null
  /** Um atendente pode estar em pausa sem que os dados dela tenham carregado. */
  emPausa: boolean
  ticketsAtivos: number
}

/**
 * Card de atendente do painel de monitoramento.
 *
 * O relógio de 1s vive AQUI, e não na página: só o tempo de pausa precisa dessa
 * cadência. Quando o tick ficava no componente raiz, a página inteira — tabelas
 * de tickets incluídas — re-renderizava a cada segundo sem necessidade, já que
 * os tempos das tabelas vêm de `useMemo` e só mudam quando os dados chegam.
 */
export function AtendenteCard({ nome, isOnline, pausaInfo, emPausa, ticketsAtivos }: AtendenteCardProps) {
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    if (!emPausa) return
    const intervalo = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(intervalo)
  }, [emPausa])

  const pausaElapsedMs = emPausa ? computePausaElapsedMs(pausaInfo, agora) : 0
  const pausaEstourada = emPausa && isPausaEstourada(pausaInfo, pausaElapsedMs)

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card/60 px-4 py-3 transition-colors hover:bg-muted/40">
      <span
        className={cn(
          'h-3 w-3 shrink-0 rounded-full',
          isOnline ? 'bg-green-500' : pausaEstourada ? 'bg-red-500' : emPausa ? 'bg-yellow-500' : 'bg-gray-400',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{nome}</p>
        <p className={cn(
          'text-xs truncate',
          isOnline
            ? 'text-green-600 dark:text-green-400'
            : pausaEstourada
              ? 'text-red-600 dark:text-red-400 font-medium'
              : emPausa
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-muted-foreground',
        )}>
          {isOnline ? 'Online' : emPausa ? formatPausaLabel(pausaInfo, pausaElapsedMs) : 'Offline'}
        </p>
      </div>
      {ticketsAtivos > 0 && (
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {ticketsAtivos} {ticketsAtivos === 1 ? 'ticket' : 'tickets'}
        </Badge>
      )}
    </div>
  )
}
