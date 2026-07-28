'use client'

import { Activity, CheckCircle, Headphones, Inbox, Timer, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type ResumoTempoReal } from '@/lib/monitoramento-tempo-real'
import { type WorkloadOs } from '@/lib/workload-os'
import { cn } from '@/lib/utils'

/** Valor do seletor para "sem recorte de subsetor". */
export const TODOS_SUBSETORES = '__todos__'

export interface OpcaoSubsetor {
  id: string
  nome: string
}

/**
 * O card "Atendimentos em tempo real".
 *
 * Extraído da página para poder ser repetido: o gestor mantém um card com o
 * setor inteiro e outro recortado num subsetor, lado a lado, com exatamente os
 * mesmos indicadores. Um componente só garante que os dois nunca divirjam na
 * apresentação — e o cálculo já é compartilhado por `calcularTempoReal`.
 *
 * O seletor fica no canto superior direito. Sem `opcoes`, ele não aparece.
 */
export function CardAtendimentosTempoReal({
  resumo,
  workload,
  tomCarga,
  tempoMaximoFila,
  tempoMaximoResposta,
  opcoes,
  subsetorSelecionado = TODOS_SUBSETORES,
  aoTrocarSubsetor,
}: {
  resumo: Pick<ResumoTempoReal, 'total' | 'naFila' | 'emAtendimento' | 'finalizadosHoje' | 'atendentesOnline'>
  workload: WorkloadOs
  tomCarga: { badge: string; value: string }
  /** Já formatados em hh:mm:ss pela página. */
  tempoMaximoFila: string
  tempoMaximoResposta: string
  opcoes?: OpcaoSubsetor[]
  subsetorSelecionado?: string
  aoTrocarSubsetor?: (id: string) => void
}) {
  const temSeletor = Boolean(opcoes?.length && aoTrocarSubsetor)

  return (
    <Card className="glass-card-elevated h-full overflow-auto rounded-lg border-l-4 border-l-primary">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
          <Activity className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">Atendimentos em tempo real</span>
        </CardTitle>

        {temSeletor && (
          <Select value={subsetorSelecionado} onValueChange={aoTrocarSubsetor}>
            <SelectTrigger className="h-8 w-[180px] shrink-0 text-xs" aria-label="Filtrar por subsetor">
              <SelectValue placeholder="Subsetor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_SUBSETORES}>Todos os subsetores</SelectItem>
              {opcoes!.map((opcao) => (
                <SelectItem key={opcao.id} value={opcao.id}>{opcao.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/80 bg-border/80 sm:grid-cols-4">
          <Numero icone={Activity} rotulo="Total ativos" valor={resumo.total} />
          <Numero icone={Inbox} rotulo="Na fila" valor={resumo.naFila} cor="text-orange-500" />
          <Numero icone={Headphones} rotulo="Em atendimento" valor={resumo.emAtendimento} cor="text-primary" />
          <Numero icone={CheckCircle} rotulo="Finalizados hoje" valor={resumo.finalizadosHoje} cor="text-green-500" />
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(190px,0.8fr)]">
          <section
            className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3"
            aria-label="Maiores esperas atuais"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Maiores esperas atuais</span>
            </div>
            <div className="mt-3 grid grid-cols-2 divide-x divide-border/70">
              <div className="min-w-0 pr-3">
                <p className="whitespace-nowrap text-lg font-semibold tracking-tight text-foreground tabular-nums">
                  {tempoMaximoFila}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Na fila</p>
              </div>
              <div className="min-w-0 pl-3">
                <p className="whitespace-nowrap text-lg font-semibold tracking-tight text-foreground tabular-nums">
                  {tempoMaximoResposta}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Sem 1ª resposta</p>
              </div>
            </div>
          </section>

          <section
            className={cn('rounded-lg border px-4 py-3', tomCarga.badge)}
            title={`${resumo.total} tickets ativos ÷ ${resumo.atendentesOnline} atendentes online compatíveis`}
            aria-label={workload.ratio === null
              ? `${workload.label}: ${resumo.total} tickets ativos e nenhum atendente online compatível`
              : `${workload.formattedRatio} tickets por atendente online: ${workload.label}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Carga por atendente</span>
              </div>
              <Badge variant="outline" className={cn('h-5 shrink-0 px-1.5 text-[10px]', tomCarga.badge)}>
                {workload.label}
              </Badge>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <p className={cn('text-2xl font-semibold tracking-tight tabular-nums', tomCarga.value)}>
                  {workload.formattedRatio}
                </p>
                <p className="text-xs text-muted-foreground">Média/OS</p>
              </div>
              <p className="pb-0.5 text-right text-[11px] leading-tight text-muted-foreground tabular-nums">
                {resumo.atendentesOnline} online
              </p>
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
  cor = 'text-foreground',
}: {
  icone: typeof Activity
  rotulo: string
  valor: number
  cor?: string
}) {
  return (
    <div className="min-w-0 bg-background/60 px-3 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icone className={cn('h-3.5 w-3.5 shrink-0', cor !== 'text-foreground' && cor)} aria-hidden="true" />
        <span className="truncate">{rotulo}</span>
      </div>
      <p className={cn('mt-2 text-2xl font-semibold tracking-tight tabular-nums', cor)}>
        {valor}
      </p>
    </div>
  )
}
