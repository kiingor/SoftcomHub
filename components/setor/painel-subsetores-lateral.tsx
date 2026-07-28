'use client'

import { Layers, Timer } from 'lucide-react'

import { type ResumoTempoReal } from '@/lib/monitoramento-tempo-real'
import { cn } from '@/lib/utils'

export interface LinhaSubsetor {
  id: string
  nome: string
  resumo: ResumoTempoReal
}

/**
 * Acompanhamento por subsetor, na coluna lateral do Monitoramento.
 *
 * Fica ao lado do "Status dos atendentes", ocupando o vão que sobrava ali. O
 * card grande da esquerda soma o setor inteiro: "43 ativos, 0 na fila" não diz
 * se o Suporte está tranquilo e o Prime afogado. Esta lista responde isso sem
 * precisar filtrar nem trocar de tela.
 *
 * Formato compacto de propósito — a coluna tem um terço da largura, e repetir
 * o card inteiro aqui espremeria os números até ficarem ilegíveis.
 */
export function PainelSubsetoresLateral({
  linhas,
  limiteEsperaMin = 15,
}: {
  linhas: LinhaSubsetor[]
  /** Acima disto a espera aparece destacada. */
  limiteEsperaMin?: number
}) {
  if (linhas.length === 0) return null

  // Sem wrapper de Card: fica DENTRO do card de status dos atendentes, e
  // aninhar Card em Card renderiza borda e fundo duplicados.
  return (
    <section aria-label="Atendimento por subsetor">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Layers className="h-4 w-4" aria-hidden="true" />
        Por subsetor
      </p>

      <div className="space-y-2">
        {linhas.map((linha) => {
          const esperaAlta = linha.resumo.maiorEsperaFilaMs > limiteEsperaMin * 60_000

          return (
            <div
              key={linha.id}
              className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium text-foreground">{linha.nome}</p>
                <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {linha.resumo.total} ativos
                </p>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <Valor
                  rotulo="Na fila"
                  valor={String(linha.resumo.naFila)}
                  tom={linha.resumo.naFila > 0 ? 'alerta' : undefined}
                />
                <Valor rotulo="Atendendo" valor={String(linha.resumo.emAtendimento)} />
                <Valor
                  rotulo="Maior espera"
                  valor={formatarEsperaCurta(linha.resumo.maiorEsperaFilaMs)}
                  tom={esperaAlta ? 'critico' : undefined}
                  icone={esperaAlta}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Na lateral não cabe `hh:mm:ss`. "22min" e "1h07" se leem de relance, que é o
 * uso real desta coluna — o número exato está no card grande ao lado.
 */
function formatarEsperaCurta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const minutos = Math.floor(ms / 60_000)
  if (minutos < 60) return `${minutos}min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) {
    const resto = minutos % 60
    return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`
  }
  return `${Math.floor(horas / 24)}d`
}

function Valor({
  rotulo,
  valor,
  tom,
  icone = false,
}: {
  rotulo: string
  valor: string
  tom?: 'alerta' | 'critico'
  icone?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className={cn(
        'flex items-center gap-1 text-base font-semibold tabular-nums',
        tom === 'alerta' && 'text-orange-600 dark:text-orange-400',
        tom === 'critico' && 'text-red-600 dark:text-red-400',
        !tom && 'text-foreground',
      )}>
        {icone && <Timer className="h-3 w-3 shrink-0" aria-hidden="true" />}
        <span className="truncate">{valor}</span>
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{rotulo}</p>
    </div>
  )
}

export { formatarEsperaCurta }
