'use client'

import { Layers, Timer } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { formatarEspera, SEM_SUBSETOR_CHAVE, type ResumoSubsetor } from '@/lib/monitoramento-subsetores'
import { cn } from '@/lib/utils'

/**
 * Uma faixa de indicadores por subsetor, em tempo real.
 *
 * O card do topo mostra o setor somado, e isso esconde qual fila está sofrendo:
 * "12 na fila" pode ser 11 no Suporte e 1 no Prime, ou 6 e 6 — decisões opostas
 * para o gestor. As faixas ficam sempre visíveis, ordenadas por quem tem mais
 * gente esperando.
 */
export function FaixasSubsetor({
  resumos,
  limiteEsperaMin = 15,
}: {
  resumos: ResumoSubsetor[]
  /** Acima disto a espera é destacada. */
  limiteEsperaMin?: number
}) {
  if (resumos.length === 0) return null

  return (
    <section className="space-y-2" aria-label="Indicadores por subsetor">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Por subsetor</span>
      </div>

      <div className="space-y-2">
        {resumos.map((resumo) => {
          const esperaAlta = (resumo.maiorEsperaMs ?? 0) > limiteEsperaMin * 60_000

          return (
            <div
              key={resumo.subsetorId ?? SEM_SUBSETOR_CHAVE}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border/70 bg-muted/20 px-4 py-3"
            >
              <div className="min-w-[8rem] flex-1">
                <p className="truncate text-sm font-medium text-foreground">{resumo.nome}</p>
                <p className="text-xs text-muted-foreground">{resumo.total} ativos</p>
              </div>

              <Indicador rotulo="Na fila" valor={resumo.naFila} destacar={resumo.naFila > 0} />
              <Indicador rotulo="Em atendimento" valor={resumo.emAtendimento} />
              <Indicador
                rotulo="Sem 1ª resposta"
                valor={resumo.aguardandoResposta}
                destacar={resumo.aguardandoResposta > 0}
              />

              <div className="min-w-[6rem]">
                <p className={cn(
                  'flex items-center gap-1 text-lg font-semibold tabular-nums',
                  esperaAlta ? 'text-red-600 dark:text-red-400' : 'text-foreground',
                )}>
                  <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {formatarEspera(resumo.maiorEsperaMs)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Maior espera</p>
              </div>

              {esperaAlta && (
                <Badge variant="outline" className="h-5 border-red-500/40 px-1.5 text-[10px] text-red-600 dark:text-red-400">
                  acima de {limiteEsperaMin}min
                </Badge>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Indicador({
  rotulo,
  valor,
  destacar = false,
}: {
  rotulo: string
  valor: number
  destacar?: boolean
}) {
  return (
    <div className="min-w-[5.5rem]">
      <p className={cn(
        'text-lg font-semibold tabular-nums',
        destacar ? 'text-orange-600 dark:text-orange-400' : 'text-foreground',
      )}>
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{rotulo}</p>
    </div>
  )
}
