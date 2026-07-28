'use client'

import { Activity, CheckCircle2, Headphones, Inbox, Layers, Timer, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatarTempoMonitoramento, type ResumoTempoReal } from '@/lib/monitoramento-tempo-real'
import { type WorkloadOs } from '@/lib/workload-os'
import { cn } from '@/lib/utils'

export interface OpcaoSubsetor {
  id: string
  nome: string
}

export interface EspacoSubsetor {
  subsetorId: string
  resumo: ResumoTempoReal | null
  workload: WorkloadOs
  /** Cores do nível de carga, vindas da página (a constante vive lá). */
  tomCarga: { badge: string }
}

/**
 * Os mesmos indicadores do card "Atendimentos em tempo real", recortados em
 * dois subsetores, na coluna lateral do Monitoramento.
 *
 * O card grande soma o setor: "3 ativos, 0 na fila" não diz se é o Prime ou o
 * Sped. Aqui o gestor escolhe dois e acompanha os dois ao mesmo tempo, com o
 * conjunto completo — total, fila, em atendimento, finalizados, as duas
 * maiores esperas e a carga por atendente.
 *
 * Os números vão em duas colunas, e não nas quatro do card original, porque
 * esta coluna tem um terço da largura da tela.
 */
export function PainelSubsetoresLateral({
  opcoes,
  espacoA,
  espacoB,
  aoTrocarA,
  aoTrocarB,
  limiteEsperaMin = 15,
}: {
  opcoes: OpcaoSubsetor[]
  espacoA: EspacoSubsetor
  espacoB: EspacoSubsetor
  aoTrocarA: (id: string) => void
  aoTrocarB: (id: string) => void
  /** Acima disto a espera na fila aparece destacada. */
  limiteEsperaMin?: number
}) {
  if (opcoes.length === 0) return null

  // Card próprio, e não embutido no de status dos atendentes: lá o conteúdo é
  // centralizado verticalmente, e acrescentar altura fazia os números daquele
  // card flutuarem no meio do vão.
  return (
    <Card className="glass-card-elevated min-w-0 rounded-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Layers className="h-4 w-4" aria-hidden="true" />
          Por subsetor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Espaco
          rotulo="Primeiro subsetor"
          espaco={espacoA}
          opcoes={opcoes}
          aoTrocar={aoTrocarA}
          limiteEsperaMin={limiteEsperaMin}
        />
        <Espaco
          rotulo="Segundo subsetor"
          espaco={espacoB}
          opcoes={opcoes}
          aoTrocar={aoTrocarB}
          limiteEsperaMin={limiteEsperaMin}
        />
      </CardContent>
    </Card>
  )
}

function Espaco({
  rotulo,
  espaco,
  opcoes,
  aoTrocar,
  limiteEsperaMin,
}: {
  rotulo: string
  espaco: EspacoSubsetor
  opcoes: OpcaoSubsetor[]
  aoTrocar: (id: string) => void
  limiteEsperaMin: number
}) {
  const resumo = espaco.resumo
  const esperaAlta = (resumo?.maiorEsperaFilaMs ?? 0) > limiteEsperaMin * 60_000

  return (
    <div className="rounded-lg border border-border/70 bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
        <Select value={espaco.subsetorId} onValueChange={aoTrocar}>
          <SelectTrigger
            className="h-7 w-full border-0 bg-transparent px-1 text-sm font-medium shadow-none focus:ring-0"
            aria-label={rotulo}
          >
            <SelectValue placeholder="Escolher subsetor" />
          </SelectTrigger>
          <SelectContent>
            {opcoes.map((opcao) => (
              <SelectItem key={opcao.id} value={opcao.id}>{opcao.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border/70">
        <Numero icone={Activity} rotulo="Total ativos" valor={resumo?.total ?? 0} />
        <Numero
          icone={Inbox}
          rotulo="Na fila"
          valor={resumo?.naFila ?? 0}
          tom={(resumo?.naFila ?? 0) > 0 ? 'alerta' : undefined}
        />
        <Numero icone={Headphones} rotulo="Em atend." valor={resumo?.emAtendimento ?? 0} tom="destaque" />
        <Numero icone={CheckCircle2} rotulo="Finalizados" valor={resumo?.finalizadosHoje ?? 0} tom="bom" />
      </div>

      <div className="space-y-2 px-3 py-3">
        <section className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5" aria-label="Maiores esperas atuais">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Timer className="h-3 w-3" aria-hidden="true" />
            <span>Maiores esperas atuais</span>
            {esperaAlta && (
              <Badge variant="outline" className="ml-auto h-4 border-red-500/40 px-1 text-[10px] text-red-600 dark:text-red-400">
                +{limiteEsperaMin}min
              </Badge>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 divide-x divide-border/70">
            <div className="min-w-0 pr-2">
              <p className={cn(
                'whitespace-nowrap text-sm font-semibold tabular-nums',
                esperaAlta ? 'text-red-600 dark:text-red-400' : 'text-foreground',
              )}>
                {formatarTempoMonitoramento(resumo?.maiorEsperaFilaMs ?? 0)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Na fila</p>
            </div>
            <div className="min-w-0 pl-2">
              <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
                {formatarTempoMonitoramento(resumo?.maiorEsperaRespostaMs ?? 0)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Sem 1ª resposta</p>
            </div>
          </div>
        </section>

        <section className={cn('rounded-lg border px-3 py-2.5', espaco.tomCarga.badge)} aria-label="Carga por atendente">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
              <span>Carga por atendente</span>
            </div>
            <Badge variant="outline" className={cn('h-4 shrink-0 px-1 text-[10px]', espaco.tomCarga.badge)}>
              {espaco.workload.label}
            </Badge>
          </div>
          <div className="mt-1.5 flex items-end justify-between gap-2">
            <div>
              <p className="text-base font-semibold tabular-nums">{espaco.workload.formattedRatio}</p>
              <p className="text-[11px] text-muted-foreground">Média/OS</p>
            </div>
            <p className="text-[11px] text-muted-foreground">{resumo?.atendentesOnline ?? 0} online</p>
          </div>
        </section>
      </div>
    </div>
  )
}

function Numero({
  icone: Icone,
  rotulo,
  valor,
  tom,
}: {
  icone: typeof Activity
  rotulo: string
  valor: number
  tom?: 'alerta' | 'destaque' | 'bom'
}) {
  return (
    <div className="min-w-0 bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icone className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{rotulo}</span>
      </div>
      <p className={cn(
        'mt-0.5 text-xl font-semibold tabular-nums',
        tom === 'alerta' && 'text-orange-600 dark:text-orange-400',
        tom === 'destaque' && 'text-primary',
        tom === 'bom' && 'text-green-600 dark:text-green-400',
        !tom && 'text-foreground',
      )}>
        {valor}
      </p>
    </div>
  )
}
