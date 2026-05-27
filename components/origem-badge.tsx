'use client'

import React from 'react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { badgeClassesPorTipo, type OrigemTicket } from '@/lib/ticket-origem'
import { cn } from '@/lib/utils'

// Badge de origem do ticket — memoizado para NÃO ser desmontado a cada setTick
// (re-render de 1s das telas de monitoramento). Sem isso, o HoverCard fecha
// sozinho a cada tick.
export const OrigemBadge = React.memo(function OrigemBadge({
  origem,
  setorAtualNome,
}: {
  origem: OrigemTicket | undefined
  setorAtualNome?: string
}) {
  if (!origem) return <span className="text-xs text-muted-foreground">—</span>
  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) }
    catch { return iso }
  }
  return (
    <HoverCard openDelay={150} closeDelay={400}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium cursor-default max-w-[260px]',
            badgeClassesPorTipo(origem.tipo),
          )}
        >
          <span className="truncate">
            {origem.label}
            {origem.transferidoPor && <span className="opacity-80"> · {origem.transferidoPor}</span>}
            {!origem.transferidoPor && origem.setorOrigem && <span className="opacity-80"> · {origem.setorOrigem}</span>}
          </span>
          {origem.hops > 1 && origem.tipo === 'transbordo' && (
            <span className="shrink-0 opacity-70">{origem.hops}x</span>
          )}
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-0 glass-dropdown rounded-2xl border-0" align="start">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Histórico do ticket</p>
            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', badgeClassesPorTipo(origem.tipo))}>
              {origem.label}
            </span>
          </div>
          {setorAtualNome && (
            <p className="text-[11px] text-muted-foreground">
              Setor atual: <strong className="text-foreground">{setorAtualNome}</strong>
            </p>
          )}
          {origem.eventos.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Sem eventos registrados — ticket criado diretamente pelo cliente.
            </p>
          ) : (
            <ol className="relative space-y-2 border-l border-border pl-4">
              {origem.eventos.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[18px] top-1 flex h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                  <p className="text-[11px] text-muted-foreground tabular-nums">{fmt(e.quando)}</p>
                  <p className="text-xs text-foreground leading-snug mt-0.5">{e.descricao}</p>
                </li>
              ))}
            </ol>
          )}
          {origem.hops > 0 && (
            <div className="rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
              Total de transbordos: <strong className="text-foreground">{origem.hops}</strong>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
})
