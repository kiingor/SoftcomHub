'use client'

import { Activity, CheckCircle2, Headphones, Inbox, Timer, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatarTempoMonitoramento, type ResumoTempoReal } from '@/lib/monitoramento-tempo-real'
import { type WorkloadOs } from '@/lib/workload-os'
import { cn } from '@/lib/utils'

export interface OpcaoSubsetor {
  id: string
  nome: string
}

/**
 * O mesmo card "Atendimentos em tempo real", recortado num subsetor.
 *
 * Dois lado a lado deixam o gestor acompanhar Suporte e Prime ao mesmo tempo —
 * o card do setor soma os dois e esconde qual das filas está sofrendo. O
 * subsetor de cada card é escolhido no próprio cabeçalho, e a escolha é
 * lembrada entre visitas.
 */
export function CardTempoRealSubsetor({
  resumo,
  workload,
  tomCarga,
  opcoes,
  subsetorSelecionado,
  aoTrocarSubsetor,
  limiteEsperaMin = 15,
}: {
  resumo: ResumoTempoReal
  workload: WorkloadOs
  /** Cores do nível de carga. Vem de fora porque a constante ainda vive
   *  duplicada nas páginas — trazer uma terceira cópia para cá seria pior. */
  tomCarga: { badge: string }
  opcoes: OpcaoSubsetor[]
  subsetorSelecionado: string
  aoTrocarSubsetor: (id: string) => void
  limiteEsperaMin?: number
}) {
  const esperaAlta = resumo.maiorEsperaFilaMs > limiteEsperaMin * 60_000

  return (
    <Card className="glass-card-elevated flex flex-col rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Activity className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">Tempo real</span>
        </div>
        <Select value={subsetorSelecionado} onValueChange={aoTrocarSubsetor}>
          <SelectTrigger className="h-8 w-[170px] text-xs" aria-label="Subsetor deste card">
            <SelectValue placeholder="Escolha o subsetor" />
          </SelectTrigger>
          <SelectContent>
            {opcoes.map((opcao) => (
              <SelectItem key={opcao.id} value={opcao.id}>{opcao.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/70 bg-border/70 sm:grid-cols-4">
          <Numero icone={Activity} rotulo="Total ativos" valor={resumo.total} />
          <Numero icone={Inbox} rotulo="Na fila" valor={resumo.naFila} tom={resumo.naFila > 0 ? 'alerta' : undefined} />
          <Numero icone={Headphones} rotulo="Em atendimento" valor={resumo.emAtendimento} tom="destaque" />
          <Numero icone={CheckCircle2} rotulo="Finalizados hoje" valor={resumo.finalizadosHoje} tom="bom" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <section className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3" aria-label="Maiores esperas atuais">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Maiores esperas atuais</span>
              {esperaAlta && (
                <Badge variant="outline" className="ml-auto h-5 border-red-500/40 px-1.5 text-[10px] text-red-600 dark:text-red-400">
                  +{limiteEsperaMin}min
                </Badge>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 divide-x divide-border/70">
              <div className="min-w-0 pr-3">
                <p className={cn(
                  'whitespace-nowrap text-lg font-semibold tracking-tight tabular-nums',
                  esperaAlta ? 'text-red-600 dark:text-red-400' : 'text-foreground',
                )}>
                  {formatarTempoMonitoramento(resumo.maiorEsperaFilaMs)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Na fila</p>
              </div>
              <div className="min-w-0 pl-3">
                <p className="whitespace-nowrap text-lg font-semibold tracking-tight tabular-nums text-foreground">
                  {formatarTempoMonitoramento(resumo.maiorEsperaRespostaMs)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Sem 1ª resposta</p>
              </div>
            </div>
          </section>

          <section className={cn('rounded-lg border px-4 py-3', tomCarga.badge)} aria-label="Carga por atendente">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Carga por atendente</span>
              </div>
              <Badge variant="outline" className={cn('h-5 shrink-0 px-1.5 text-[10px]', tomCarga.badge)}>
                {workload.label}
              </Badge>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <p className="text-lg font-semibold tracking-tight tabular-nums">{workload.formattedRatio}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Média/OS</p>
              </div>
              <p className="text-xs text-muted-foreground">{resumo.atendentesOnline} online</p>
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
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
    <div className="bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{rotulo}</span>
      </div>
      <p className={cn(
        'mt-1 text-2xl font-semibold tabular-nums',
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
